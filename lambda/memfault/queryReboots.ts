import {
	DynamoDBClient,
	QueryCommand,
	type QueryCommandInput,
} from '@aws-sdk/client-dynamodb'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import { aProblem } from '@hello.nrfcloud.com/lambda-helpers/aProblem'
import { aResponse } from '@hello.nrfcloud.com/lambda-helpers/aResponse'
import { addVersionHeader } from '@hello.nrfcloud.com/lambda-helpers/addVersionHeader'
import { corsOPTIONS } from '@hello.nrfcloud.com/lambda-helpers/corsOPTIONS'
import { LwM2MObjectID, definitions } from '@hello.nrfcloud.com/proto-map/lwm2m'
import { fingerprintRegExp } from '@hello.nrfcloud.com/proto/fingerprint'
import {
	Context,
	HttpStatusCode,
	deviceId,
	type LwM2MObjectHistory,
} from '@hello.nrfcloud.com/proto/hello'
import middy from '@middy/core'
import inputOutputLogger from '@middy/input-output-logger'
import { fromEnv } from '@nordicsemiconductor/from-env'
import { Type, type Static } from '@sinclair/typebox'
import type { APIGatewayProxyResultV2 } from 'aws-lambda'
import { getDeviceById } from '../../devices/getDeviceById.js'
import {
	HistoricalDataTimeSpans,
	LastHour,
} from '../../historicalData/HistoricalDataTimeSpans.js'
import { validateInput, type ValidInput } from '../middleware/validateInput.js'

const { tableName, DevicesTableName, version } = fromEnv({
	version: 'VERSION',
	tableName: 'TABLE_NAME',
	DevicesTableName: 'DEVICES_TABLE_NAME',
})(process.env)

const InputSchema = Type.Object({
	deviceId,
	fingerprint: Type.Optional(Type.RegExp(fingerprintRegExp)),
	timeSpan: Type.Optional(
		Type.Union(
			Object.keys(HistoricalDataTimeSpans).map((timeSpan) =>
				Type.Literal(timeSpan),
			),
		),
	),
})
const db = new DynamoDBClient({})
const getDevice = getDeviceById({
	db,
	DevicesTableName,
})

const h = async (
	event: ValidInput<typeof InputSchema>,
): Promise<APIGatewayProxyResultV2> => {
	const maybeDevice = await getDevice(event.validInput.deviceId)
	if ('error' in maybeDevice) {
		return aProblem({
			title: `No device found with ID!`,
			detail: event.validInput.deviceId,
			status: HttpStatusCode.NOT_FOUND,
		})
	}
	const device = maybeDevice.device
	if (device.fingerprint !== event.validInput.fingerprint) {
		return aProblem({
			title: `Fingerprint does not match!`,
			detail: event.validInput.fingerprint,
			status: HttpStatusCode.FORBIDDEN,
		})
	}

	const timeSpan =
		event.validInput.timeSpan !== undefined
			? HistoricalDataTimeSpans[event.validInput.timeSpan] ?? LastHour
			: LastHour

	const result: Static<typeof LwM2MObjectHistory> = {
		'@context': Context.lwm2mObjectHistory.toString(),
		query: {
			ObjectID: LwM2MObjectID.Reboot_14250,
			ObjectVersion: definitions[LwM2MObjectID.Reboot_14250].ObjectVersion,
			deviceId: device.id,
			binIntervalMinutes: timeSpan.binIntervalMinutes,
			ObjectInstanceID: 0, // Not used
		},
		partialInstances: [],
	}

	const Query: QueryCommandInput = {
		TableName: tableName,
		KeyConditionExpression: '#deviceId = :deviceId AND #timestamp > :from',
		ExpressionAttributeNames: {
			'#deviceId': 'deviceId',
			'#reason': 'reason',
			'#timestamp': 'timestamp',
		},
		ExpressionAttributeValues: {
			':deviceId': {
				S: device.id,
			},
			':from': {
				S: new Date(
					Date.now() - timeSpan.durationHours * 60 * 60 * 1000,
				).toISOString(),
			},
		},
		ProjectionExpression: '#reason, #timestamp',
	}
	console.log('Query', JSON.stringify(Query))

	const maybeItems = await db.send(new QueryCommand(Query))

	console.log('Items', JSON.stringify(maybeItems.Items))

	const history = (maybeItems.Items?.map((item) => unmarshall(item)) ?? []).map(
		(item) => ({
			'0': item.reason as number,
			'99': Math.floor(new Date(item.timestamp).getTime() / 1000),
		}),
	)

	result.partialInstances = history

	return aResponse(
		200,
		{
			...result,
			'@context': Context.lwm2mObjectHistory,
		},
		timeSpan.expiresMinutes * 60,
	)
}

export const handler = middy()
	.use(inputOutputLogger())
	.use(addVersionHeader(version))
	.use(corsOPTIONS('GET'))
	.use(validateInput(InputSchema))
	.handler(h)
