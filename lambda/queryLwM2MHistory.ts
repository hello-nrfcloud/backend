import { MetricUnit } from '@aws-lambda-powertools/metrics'
import { logMetrics } from '@aws-lambda-powertools/metrics/middleware'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import {
	QueryCommand,
	TimestreamQueryClient,
	ValidationException,
} from '@aws-sdk/client-timestream-query'
import { aProblem } from '@hello.nrfcloud.com/lambda-helpers/aProblem'
import { aResponse } from '@hello.nrfcloud.com/lambda-helpers/aResponse'
import { addVersionHeader } from '@hello.nrfcloud.com/lambda-helpers/addVersionHeader'
import { corsOPTIONS } from '@hello.nrfcloud.com/lambda-helpers/corsOPTIONS'
import { metricsForComponent } from '@hello.nrfcloud.com/lambda-helpers/metrics'
import {
	LwM2MObjectIDs,
	definitions,
	timestampResources,
	type LWM2MObjectInfo,
} from '@hello.nrfcloud.com/proto-map/lwm2m'
import { fingerprintRegExp } from '@hello.nrfcloud.com/proto/fingerprint'
import {
	Context,
	HttpStatusCode,
	deviceId,
	type LwM2MObjectHistory,
} from '@hello.nrfcloud.com/proto/hello'
import middy from '@middy/core'
import { requestLogger } from '@hello.nrfcloud.com/lambda-helpers/requestLogger'
import { fromEnv } from '@bifravst/from-env'
import { parseResult } from '@bifravst/timestream-helpers'
import { Type, type Static } from '@sinclair/typebox'
import type {
	APIGatewayProxyEventV2,
	APIGatewayProxyResultV2,
} from 'aws-lambda'
import { once } from 'lodash-es'
import {
	HistoricalDataTimeSpans,
	LastHour,
	type HistoricalDataTimeSpan,
} from '../historicalData/HistoricalDataTimeSpans.js'
import { getAvailableColumns } from '../historicalData/getAvailableColumns.js'
import { isNumeric } from '../lwm2m/isNumeric.js'
import {
	validateInput,
	type ValidInput,
} from '@hello.nrfcloud.com/lambda-helpers/validateInput'
import { withDevice, type WithDevice } from './middleware/withDevice.js'
import type { Device } from '../devices/device.js'
import { SSMClient } from '@aws-sdk/client-ssm'
import { deviceJWT } from './jwt/verifyToken.js'
import { fetchMapJWTPublicKeys } from './map/fetchMapJWTPublicKeys.js'

const { tableInfo, DevicesTableName, version, isTest, stackName } = fromEnv({
	version: 'VERSION',
	tableInfo: 'HISTORICAL_DATA_TABLE_INFO',
	DevicesTableName: 'DEVICES_TABLE_NAME',
	stackName: 'STACK_NAME',
	isTest: 'IS_TEST',
})(process.env)

const [DatabaseName, TableName] = tableInfo.split('|')
if (DatabaseName === undefined || TableName === undefined)
	throw new Error('Historical database is invalid')

const ts = new TimestreamQueryClient({})
const db = new DynamoDBClient({})
const ssm = new SSMClient({})

const aggregateFns = ['avg', 'min', 'max', 'sum', 'count']

const Aggregate = Type.Union(
	aggregateFns.map((fn) => Type.Literal(fn)),
	{
		title: 'Aggregate',
		description:
			'The aggregate function to use. See https://docs.aws.amazon.com/timestream/latest/developerguide/aggregate-functions.html',
		default: 'avg',
	},
)

const { track, metrics } = metricsForComponent('history')

const InputSchema = Type.Intersect([
	Type.Object({
		deviceId,
		objectId: Type.Union(LwM2MObjectIDs.map((id) => Type.Literal(id))),
		instanceId: Type.Integer({ minimum: 0 }),
		timeSpan: Type.Optional(
			Type.Union(
				Object.keys(HistoricalDataTimeSpans).map((timeSpan) =>
					Type.Literal(timeSpan),
				),
			),
		),
		aggregate: Type.Optional(Aggregate),
	}),
	Type.Union([
		Type.Object({
			fingerprint: Type.RegExp(fingerprintRegExp),
		}),
		Type.Object({
			jwt: Type.String({
				minLength: 32,
				title: 'JWT',
				description:
					'A device JWT signed by the hello.nrfcloud.com/map backend',
			}),
		}),
	]),
])

const mapJwtPublicKeys = once(async () =>
	fetchMapJWTPublicKeys({
		ssm,
		stackName,
		onError: (err, url) => console.error(`[fetchJWTPublicKeys]`, err, url),
		debug: console.debug,
	}),
)

// TODO: cache globally
// Do not cache the result if we are in test mode
const availableColumnsCache =
	isTest === '1'
		? async () => {
				console.warn(
					`Fetching available columns for ${DatabaseName}.${TableName}.`,
				)
				const cols = await getAvailableColumns(ts, DatabaseName, TableName)()
				console.warn(`Available columns`, JSON.stringify(cols))
				return cols
			}
		: once(getAvailableColumns(ts, DatabaseName, TableName))

const h = async (
	event: APIGatewayProxyEventV2,
	context: ValidInput<typeof InputSchema> & WithDevice,
): Promise<APIGatewayProxyResultV2> => {
	const {
		objectId: ObjectID,
		instanceId: InstanceID,
		aggregate,
	} = context.validInput
	const def = definitions[ObjectID]
	const timeSpan =
		HistoricalDataTimeSpans[context.validInput.timeSpan ?? ''] ?? LastHour

	try {
		const result: Static<typeof LwM2MObjectHistory> = {
			'@context': Context.lwm2mObjectHistory.toString(),
			query: {
				ObjectID,
				ObjectVersion: def.ObjectVersion,
				ObjectInstanceID: InstanceID,
				deviceId: context.device.id,
				binIntervalMinutes: timeSpan.binIntervalMinutes,
			},
			partialInstances: [],
		}

		result.partialInstances = await binResourceHistory({
			def,
			instance: InstanceID,
			device: context.device,
			timeSpan,
			aggregateFn: aggregate ?? 'avg',
		})

		return aResponse(
			200,
			{
				...result,
				'@context': Context.lwm2mObjectHistory,
			},
			timeSpan.expiresMinutes * 60,
		)
	} catch (err) {
		console.error(err)
		if (err instanceof ValidationException) {
			const SyntaxErrorRegExp =
				/The query syntax is invalid at line 1:(?<col>[0-9]+)/
			const maybeSyntaxError = SyntaxErrorRegExp.exec(err.message)
			if (maybeSyntaxError?.groups?.col !== undefined) {
				console.debug(
					`${' '.repeat(parseInt(maybeSyntaxError.groups.col, 10))}^`,
				)
			}
		}
		return aProblem({
			title: 'Query failed',
			status: HttpStatusCode.INTERNAL_SERVER_ERROR,
		})
	}
}

const binResourceHistory = async ({
	def,
	instance,
	device,
	timeSpan: { binIntervalMinutes, durationHours },
	aggregateFn,
}: {
	def: LWM2MObjectInfo
	instance: number
	device: Pick<Device, 'id' | 'hideDataBefore'>
	timeSpan: HistoricalDataTimeSpan
	aggregateFn: string
}): Promise<
	Array<Record<number, string | number | boolean> & { ts: string }>
> => {
	const availableColumns = await availableColumnsCache()
	const resourceNames = Object.values(def.Resources)
		.filter(isNumeric)
		.map<[string, number]>(({ ResourceID }) => [
			`${def.ObjectID}/${def.ObjectVersion}/${ResourceID}`,
			ResourceID,
		])
		// Only select the columns that exist
		.filter(([name]) => {
			const available = availableColumns.includes(name)
			if (!available) console.warn(`Column not found: ${name}!`)
			return available
		})
	const tsResource = timestampResources.get(def.ObjectID)
	if (tsResource === undefined) {
		console.error(
			`No timestamp resource defined for found for ${def.ObjectID}!`,
		)
		return []
	}
	const columns = [
		...resourceNames.map(
			([alias, ResourceID]) => `${aggregateFn}("${alias}") AS "${ResourceID}"`,
		),
		`floor(to_unixtime(bin(time, ${binIntervalMinutes}m))) AS "${tsResource}"`,
	]

	if (columns.length === 0) {
		console.error(`No columns found for ${def.ObjectID}/${instance}!`)
		console.error(`Available columns: ${availableColumns.join(', ')}`)
		return []
	}

	const QueryString = [
		`SELECT `,
		columns.join(','),
		`FROM "${DatabaseName}"."${TableName}"`,
		`WHERE measure_name = '${def.ObjectID}/${instance}'`,
		`AND time > date_add('hour', -${durationHours}, now())`,
		device.hideDataBefore !== undefined
			? `AND time > from_iso8601_timestamp('${device.hideDataBefore.toISOString()}')`
			: '',
		`AND ObjectID = '${def.ObjectID}'`,
		`AND ObjectInstanceID = '${instance}'`,
		`AND ObjectVersion = '${def.ObjectVersion}'`,
		`AND deviceId = '${device.id}'`,
		`GROUP BY bin(time, ${binIntervalMinutes}m)`,
		`ORDER BY bin(time, ${binIntervalMinutes}m) DESC`,
	].join(' ')

	console.log({ QueryString })
	const start = Date.now()
	const result = await ts.send(
		new QueryCommand({
			QueryString,
		}),
	)
	console.debug(JSON.stringify({ result }))
	track('QueryTime', MetricUnit.Milliseconds, Date.now() - start)
	return parseResult(result)
}

export const handler = middy()
	.use(corsOPTIONS('GET'))
	.use(addVersionHeader(version))
	.use(requestLogger())
	.use(logMetrics(metrics))
	.use(
		validateInput(InputSchema, (event) => {
			const { deviceId, objectId, instanceId } = event.pathParameters ?? {}
			return {
				...(event.queryStringParameters ?? {}),
				deviceId,
				objectId: parseInt(objectId ?? '-1', 10),
				instanceId: parseInt(instanceId ?? '-1', 10),
			}
		}),
	)
	.use(
		withDevice({
			db,
			DevicesTableName,
			validateDeviceJWT: async (token: string) =>
				deviceJWT(await mapJwtPublicKeys())(token),
		}),
	)
	.handler(h)
