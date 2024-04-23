import {
	QueryCommand,
	TimestreamQueryClient,
	ValidationException,
} from '@aws-sdk/client-timestream-query'
import {
	formatTypeBoxErrors,
	validateWithTypeBox,
} from '@hello.nrfcloud.com/proto'
import { HttpStatusCode, deviceId } from '@hello.nrfcloud.com/proto/hello'
import {
	definitions,
	isLwM2MObjectID,
	type LWM2MObjectInfo,
} from '@hello.nrfcloud.com/proto-map'
import { Context, ResourceHistory } from '@hello.nrfcloud.com/proto-map/api'
import { fromEnv } from '@nordicsemiconductor/from-env'
import { parseResult } from '@nordicsemiconductor/timestream-helpers'
import { Type, type Static } from '@sinclair/typebox'
import type {
	APIGatewayProxyEventV2,
	APIGatewayProxyResultV2,
} from 'aws-lambda'
import middy from '@middy/core'
import { corsOPTIONS } from '@hello.nrfcloud.com/lambda-helpers/corsOPTIONS'
import { aProblem } from '@hello.nrfcloud.com/lambda-helpers/aProblem'
import { aResponse } from '@hello.nrfcloud.com/lambda-helpers/aResponse'
import { addVersionHeader } from '@hello.nrfcloud.com/lambda-helpers/addVersionHeader'
import { isNumeric } from '../lwm2m/isNumeric.js'
import { fingerprintRegExp } from '@hello.nrfcloud.com/proto/fingerprint'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { getDeviceById } from '../devices/getDeviceById.js'

const { tableInfo, DevicesTableName, version } = fromEnv({
	version: 'VERSION',
	tableInfo: 'HISTORICAL_DATA_TABLE_INFO',
	DevicesTableName: 'DEVICES_TABLE_NAME',
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
		id: deviceId,
		fingerprint: Type.Optional(Type.RegExp(fingerprintRegExp)),
	}),
)

const db = new DynamoDBClient({})
const getDevice = getDeviceById({
	db,
	DevicesTableName,
})

// TODO: cache globally
const availableColumns =
	(
		await ts.send(
			new QueryCommand({
				QueryString: `SELECT * FROM "${DatabaseName}"."${TableName}" LIMIT 1`,
			}),
		)
	)?.ColumnInfo?.map(({ Name }) => Name) ?? []

const h = async (
	event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
	console.log(JSON.stringify(event))

	const maybeValidInput = validateInput({
		...(event.pathParameters ?? {}),
		...(event.queryStringParameters ?? {}),
	})
	if ('errors' in maybeValidInput) {
		return aProblem({
			title: 'Validation failed',
			status: 400,
			detail: formatTypeBoxErrors(maybeValidInput.errors),
		})
	}

	const maybeDevice = await getDevice(maybeValidInput.value.id)
	if ('error' in maybeDevice) {
		return aProblem({
			title: `No device found with ID!`,
			detail: maybeValidInput.value.id,
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

	const { instance } = maybeValidInput.value

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
		const history = await queryResourceHistory({
			def,
			instance: InstanceID,
			deviceId: device.id,
		})
		const result: Static<typeof ResourceHistory> = {
			'@context': Context.history.resource.toString(),
			query: {
				ObjectID,
				ObjectVersion: def.ObjectVersion,
				ObjectInstanceID: InstanceID,
				deviceId: device.id,
				binIntervalMinutes,
			},
			partialInstances: history,
		}
		return aResponse(
			200,
			{
				...result,
				'@context': Context.history.resource,
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
}): Promise<
	Array<Record<number, string | number | boolean> & { ts: string }>
> => {
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
