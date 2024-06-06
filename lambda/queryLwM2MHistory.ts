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
import {
	formatTypeBoxErrors,
	validateWithTypeBox,
} from '@hello.nrfcloud.com/proto'
import {
	LwM2MObjectID,
	LwM2MObjectIDs,
	definitions,
	type LWM2MObjectInfo,
} from '@hello.nrfcloud.com/proto-map/lwm2m'
import { fingerprintRegExp } from '@hello.nrfcloud.com/proto/fingerprint'
import {
	Context,
	HttpStatusCode,
	type LwM2MObjectHistory,
	deviceId,
} from '@hello.nrfcloud.com/proto/hello'
import middy from '@middy/core'
import { fromEnv } from '@nordicsemiconductor/from-env'
import { parseResult } from '@nordicsemiconductor/timestream-helpers'
import { Type, type Static } from '@sinclair/typebox'
import type {
	APIGatewayProxyEventV2,
	APIGatewayProxyResultV2,
} from 'aws-lambda'
import { getDeviceById } from '../devices/getDeviceById.js'
import {
	HistoricalDataTimeSpans,
	LastHour,
	type HistoricalDataTimeSpan,
} from '../historicalData/HistoricalDataTimeSpans.js'
import { isNumeric } from '../lwm2m/isNumeric.js'
import { createTrailOfCoordinates } from './historical-data/createTrailOfCoordinates.js'
import { once } from 'lodash-es'
import { getAvailableColumns } from '../historicalData/getAvailableColumns.js'
import { metricsForComponent } from '@hello.nrfcloud.com/lambda-helpers/metrics'
import { logMetrics } from '@aws-lambda-powertools/metrics/middleware'
import { MetricUnit } from '@aws-lambda-powertools/metrics'

const { tableInfo, DevicesTableName, version, isTest } = fromEnv({
	version: 'VERSION',
	tableInfo: 'HISTORICAL_DATA_TABLE_INFO',
	DevicesTableName: 'DEVICES_TABLE_NAME',
	isTest: 'IS_TEST',
})(process.env)

const [DatabaseName, TableName] = tableInfo.split('|')
if (DatabaseName === undefined || TableName === undefined)
	throw new Error('Historical database is invalid')

const ts = new TimestreamQueryClient({})

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

const validateInput = validateWithTypeBox(
	Type.Object({
		deviceId,
		objectId: Type.Union(LwM2MObjectIDs.map((id) => Type.Literal(id))),
		instanceId: Type.Integer({ minimum: 0 }),
		fingerprint: Type.Optional(Type.RegExp(fingerprintRegExp)),
		timeSpan: Type.Optional(
			Type.Union(
				Object.keys(HistoricalDataTimeSpans).map((timeSpan) =>
					Type.Literal(timeSpan),
				),
			),
		),
		aggregate: Type.Optional(Aggregate),
		trail: Type.Optional(
			Type.Integer({
				minimum: 1,
				description:
					'Create a location trail with the minimum distance in kilometers. Only applicable with ObjectID 14201.',
			}),
		),
	}),
)

const db = new DynamoDBClient({})
const getDevice = getDeviceById({
	db,
	DevicesTableName,
})

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
): Promise<APIGatewayProxyResultV2> => {
	console.log(JSON.stringify(event))

	const { deviceId, objectId, instanceId } = event.pathParameters ?? {}
	const { trail } = event.queryStringParameters ?? {}
	const maybeValidInput = validateInput({
		...(event.queryStringParameters ?? {}),
		trail: trail !== undefined ? parseInt(trail, 10) : undefined,
		deviceId,
		objectId: parseInt(objectId ?? '-1', 10),
		instanceId: parseInt(instanceId ?? '-1', 10),
	})
	if ('errors' in maybeValidInput) {
		return aProblem({
			title: 'Validation failed',
			status: HttpStatusCode.BAD_REQUEST,
			detail: formatTypeBoxErrors(maybeValidInput.errors),
		})
	}

	const maybeDevice = await getDevice(maybeValidInput.value.deviceId)
	if ('error' in maybeDevice) {
		return aProblem({
			title: `No device found with ID!`,
			detail: maybeValidInput.value.deviceId,
			status: HttpStatusCode.NOT_FOUND,
		})
	}
	const device = maybeDevice.device
	if (device.fingerprint !== maybeValidInput.value.fingerprint) {
		return aProblem({
			title: `Fingerprint does not match!`,
			detail: maybeValidInput.value.fingerprint,
			status: HttpStatusCode.FORBIDDEN,
		})
	}

	const {
		objectId: ObjectID,
		instanceId: InstanceID,
		aggregate,
	} = maybeValidInput.value
	const def = definitions[ObjectID]
	const timeSpan =
		HistoricalDataTimeSpans[maybeValidInput.value.timeSpan ?? ''] ?? LastHour

	try {
		const result: Static<typeof LwM2MObjectHistory> = {
			'@context': Context.lwm2mObjectHistory.toString(),
			query: {
				ObjectID,
				ObjectVersion: def.ObjectVersion,
				ObjectInstanceID: InstanceID,
				deviceId: device.id,
				binIntervalMinutes: timeSpan.binIntervalMinutes,
			},
			partialInstances: [],
		}
		if (maybeValidInput.value.trail !== undefined) {
			if (ObjectID !== LwM2MObjectID.Geolocation_14201) {
				return aProblem({
					title: `Trail option must only be used with ObjectID ${LwM2MObjectID.Geolocation_14201}!`,
					detail: `${maybeValidInput.value.objectId}`,
					status: HttpStatusCode.BAD_REQUEST,
				})
			}
			// Request the location history, but fold similar locations
			const history = (await getResourceHistory({
				def,
				instance: InstanceID,
				deviceId: device.id,
				timeSpan,
				dir: 'ASC',
			})) as Array<{
				0: number
				1: number
				6: string
				ts: string
			}>

			const source = history[0]?.[6] ?? 'GNSS'

			result.partialInstances = createTrailOfCoordinates(
				maybeValidInput.value.trail,
				history.map(({ '0': lat, '1': lng, ts }) => ({
					lat,
					lng,
					ts: new Date(ts).getTime(),
				})),
			).map(({ lat, lng, ts, radiusKm }) => ({
				'0': lat,
				'1': lng,
				'3': radiusKm * 1000,
				'6': source,
				'99': ts,
			}))
		} else {
			result.partialInstances = await binResourceHistory({
				def,
				instance: InstanceID,
				deviceId: device.id,
				timeSpan,
				aggregateFn: aggregate ?? 'avg',
			})
		}

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
	deviceId,
	timeSpan: { binIntervalMinutes, durationHours },
	aggregateFn,
}: {
	def: LWM2MObjectInfo
	instance: number
	deviceId: string
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
			if (!available) console.error(`Column not found: ${name}!`)
			return available
		})

	const columns = [
		...resourceNames.map(
			([alias, ResourceID]) => `${aggregateFn}("${alias}") AS "${ResourceID}"`,
		),
		`bin(time, ${binIntervalMinutes}m) AS ts`,
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
		`AND ObjectID = '${def.ObjectID}'`,
		`AND ObjectInstanceID = '${instance}'`,
		`AND ObjectVersion = '${def.ObjectVersion}'`,
		`AND deviceId = '${deviceId}'`,
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

const getResourceHistory = async ({
	def,
	instance,
	deviceId,
	timeSpan: { durationHours },
	dir,
}: {
	def: LWM2MObjectInfo
	instance: number
	deviceId: string
	timeSpan: HistoricalDataTimeSpan
	dir?: string
}): Promise<Array<Record<number, string | number | boolean>>> => {
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
			if (!available) console.error(`Column not found: ${name}!`)
			return available
		})

	const columns = [
		...resourceNames.map(
			([alias, ResourceID]) => `"${alias}" AS "${ResourceID}"`,
		),
		`time AS ts`,
	]

	if (columns.length === 0) {
		console.error(`No columns found for ${def.ObjectID}/${instance}!`)
		console.error(`Available columns: ${availableColumns.join(', ')}`)
		return []
	}

	const QueryString = [
		`SELECT `,
		columns.join(', '),
		`FROM "${DatabaseName}"."${TableName}"`,
		`WHERE measure_name = '${def.ObjectID}/${instance}'`,
		`AND time > date_add('hour', -${durationHours}, now())`,
		`AND ObjectID = '${def.ObjectID}'`,
		`AND ObjectInstanceID = '${instance}'`,
		`AND ObjectVersion = '${def.ObjectVersion}'`,
		`AND deviceId = '${deviceId}'`,
		`ORDER BY time ${dir ?? 'DESC'}`,
	].join(' ')

	console.log({ QueryString })

	const start = Date.now()
	const result = await ts.send(
		new QueryCommand({
			QueryString,
		}),
	)
	track('QueryTime', MetricUnit.Milliseconds, Date.now() - start)
	console.debug(JSON.stringify({ result }))

	return parseResult(result)
}

export const handler = middy()
	.use(logMetrics(metrics))
	.use(addVersionHeader(version))
	.use(corsOPTIONS('GET'))
	.handler(h)
