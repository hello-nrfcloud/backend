import {
	DynamoDBClient,
	QueryCommand,
	type QueryCommandInput,
} from '@aws-sdk/client-dynamodb'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import { aResponse } from '@hello.nrfcloud.com/lambda-helpers/aResponse'
import { addVersionHeader } from '@hello.nrfcloud.com/lambda-helpers/addVersionHeader'
import { corsOPTIONS } from '@hello.nrfcloud.com/lambda-helpers/corsOPTIONS'
import { LwM2MObjectID, definitions } from '@hello.nrfcloud.com/proto-map/lwm2m'
import { fingerprintRegExp } from '@hello.nrfcloud.com/proto/fingerprint'
import {
	Context,
	deviceId,
	type LwM2MObjectHistory,
} from '@hello.nrfcloud.com/proto/hello'
import middy from '@middy/core'
import { requestLogger } from '../middleware/requestLogger.js'
import { fromEnv } from '@bifravst/from-env'
import { Type, type Static } from '@sinclair/typebox'
import type {
	APIGatewayProxyEventV2,
	APIGatewayProxyResultV2,
} from 'aws-lambda'
import {
	HistoricalDataTimeSpans,
	LastHour,
} from '../../historicalData/HistoricalDataTimeSpans.js'
import { validateInput, type ValidInput } from '../middleware/validateInput.js'
import { withDevice, type WithDevice } from '../middleware/withDevice.js'
import { deviceJWT } from '../jwt/verifyToken.js'
import { SSMClient } from '@aws-sdk/client-ssm'
import { fetchJWTPublicKeys } from '../jwt/fetchJWTPublicKeys.js'
import { getMapSettings } from '../../settings/map.js'

const { tableName, DevicesTableName, version, stackName } = fromEnv({
	version: 'VERSION',
	tableName: 'TABLE_NAME',
	DevicesTableName: 'DEVICES_TABLE_NAME',
	stackName: 'STACK_NAME',
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
const ssm = new SSMClient({})

const mapJwtPublicKeys = await fetchJWTPublicKeys(
	new URL(
		'./2024-04-15/.well-known/jwks.json',
		(await getMapSettings({ ssm, stackName })).apiEndpoint,
	),
)

const h = async (
	event: APIGatewayProxyEventV2,
	context: ValidInput<typeof InputSchema> & WithDevice,
): Promise<APIGatewayProxyResultV2> => {
	const timeSpan =
		context.validInput.timeSpan !== undefined
			? (HistoricalDataTimeSpans[context.validInput.timeSpan] ?? LastHour)
			: LastHour

	const result: Static<typeof LwM2MObjectHistory> = {
		'@context': Context.lwm2mObjectHistory.toString(),
		query: {
			ObjectID: LwM2MObjectID.Reboot_14250,
			ObjectVersion: definitions[LwM2MObjectID.Reboot_14250].ObjectVersion,
			deviceId: context.device.id,
			binIntervalMinutes: timeSpan.binIntervalMinutes,
			ObjectInstanceID: 0, // Not used
		},
		partialInstances: [],
	}

	const from = Math.max(
		Date.now() - timeSpan.durationHours * 60 * 60 * 1000,
		context.device.hideDataBefore?.getTime() ?? 0,
	)
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
				S: context.device.id,
			},
			':from': {
				S: new Date(from).toISOString(),
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
	.use(corsOPTIONS('GET'))
	.use(addVersionHeader(version))
	.use(requestLogger())
	.use(validateInput(InputSchema))
	.use(
		withDevice({
			db,
			DevicesTableName,
			validateDeviceJWT: deviceJWT(mapJwtPublicKeys),
		}),
	)
	.handler(h)
