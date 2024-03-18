import {
	QueryCommand,
	TimestreamQueryClient,
	ValidationException,
} from '@aws-sdk/client-timestream-query'
import {
	formatTypeBoxErrors,
	validateWithTypeBox,
} from '@hello.nrfcloud.com/proto'
import {
	definitions,
	isLwM2MObjectID,
	type LWM2MObjectInfo,
} from '@hello.nrfcloud.com/proto-map'
import { PublicDeviceId } from '@hello.nrfcloud.com/proto/hello/map'
import { fromEnv } from '@nordicsemiconductor/from-env'
import { parseResult } from '@nordicsemiconductor/timestream-helpers'
import { Type } from '@sinclair/typebox'
import type {
	APIGatewayProxyEventV2,
	APIGatewayProxyResultV2,
} from 'aws-lambda'
import { isNumeric } from './isNumeric.js'
import middy from '@middy/core'
import { corsOPTIONS } from '../util/corsOPTIONS.js'
import { aProblem } from '../util/aProblem.js'
import { aResponse } from '../util/aResponse.js'
import { addVersionHeader } from '../util/addVersionHeader.js'

const { tableInfo, version } = fromEnv({
	version: 'VERSION',
	tableInfo: 'HISTORICAL_DATA_TABLE_INFO',
})(process.env)

const [DatabaseName, TableName] = tableInfo.split('|')
if (DatabaseName === undefined || TableName === undefined)
	throw new Error('Historical database is invalid')

const ts = new TimestreamQueryClient({})

const binIntervalMinutes = 15

const validateInput = validateWithTypeBox(
	Type.Object({
		instance: Type.RegExp('^[0-9]+/[0-9]+$', {
			title: 'Instance',
			examples: ['14201/1'],
		}),
		deviceId: Type.Union([
			PublicDeviceId,
			Type.RegExp('^[0-9]+$', { title: 'Numeric Device ID (legacy)' }),
		]),
	}),
)

const h = async (
	event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
	console.log(JSON.stringify(event))

	const maybeValidQuery = validateInput(event.queryStringParameters)
	if ('errors' in maybeValidQuery) {
		return aProblem({
			title: 'Validation failed',
			status: 400,
			detail: formatTypeBoxErrors(maybeValidQuery.errors),
		})
	}

	const { instance, deviceId } = maybeValidQuery.value

	const [ObjectID, InstanceID] = (instance
		?.split('/')
		.map((s) => parseInt(s, 10)) ?? [-1, -1]) as [number, number]
	if (!isLwM2MObjectID(ObjectID))
		return aProblem({
			title: `Unknown LwM2M ObjectID: ${ObjectID}`,
			status: 400,
		})

	const def = definitions[ObjectID]

	try {
		const res = await queryResourceHistory({
			def,
			instance: InstanceID,
			deviceId,
		})
		return aResponse(
			200,
			{
				'@context': new URL(
					'https://github.com/hello-nrfcloud/proto/map/history',
				),
				query: {
					ObjectID,
					ObjectVersion: def.ObjectVersion,
					InstanceID,
					deviceId,
					binIntervalMinutes,
				},
				partialInstances: res,
			},
			binIntervalMinutes * 60,
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
			status: 500,
		})
	}
}

const queryResourceHistory = async ({
	def,
	instance,
	deviceId,
}: {
	def: LWM2MObjectInfo
	instance: number
	deviceId: string
}) => {
	// TODO: cache
	const availableColumns =
		(
			await ts.send(
				new QueryCommand({
					QueryString: `SELECT * FROM "${DatabaseName}"."${TableName}" LIMIT 1`,
				}),
			)
		)?.ColumnInfo?.map(({ Name }) => Name) ?? []

	const resourceNames = Object.values(def.Resources)
		.filter(isNumeric)
		.map<[string, number]>(({ ResourceID }) => [
			`${def.ObjectID}/${def.ObjectVersion}/${ResourceID}`,
			ResourceID,
		])

	const QueryString = [
		`SELECT `,
		...resourceNames
			// Only select the columns that exist
			.filter(([name]) => availableColumns.includes(name))
			.map(([alias, ResourceID]) => `AVG("${alias}") AS "${ResourceID}",`),
		`bin(time, ${binIntervalMinutes}m) AS ts`,
		`FROM "${DatabaseName}"."${TableName}"`,
		`WHERE measure_name = '${def.ObjectID}/${instance}'`,
		`AND time > date_add('hour', -24, now())`,
		`AND ObjectID = '${def.ObjectID}'`,
		`AND ObjectInstanceID = '${instance}'`,
		`AND ObjectVersion = '${def.ObjectVersion}'`,
		`AND deviceId = '${deviceId}'`,
		`GROUP BY bin(time, ${binIntervalMinutes}m)`,
		`ORDER BY bin(time, ${binIntervalMinutes}m) DESC`,
	].join(' ')

	return parseResult(
		await ts.send(
			new QueryCommand({
				QueryString,
			}),
		),
	)
}

export const handler = middy()
	.use(addVersionHeader(version))
	.use(corsOPTIONS('GET'))
	.handler(h)
