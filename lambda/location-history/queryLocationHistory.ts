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
import { requestLogger } from '@hello.nrfcloud.com/lambda-helpers/requestLogger'
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
import { createTrailOfCoordinates } from '../historical-data/createTrailOfCoordinates.js'
import {
	validateInput,
	type ValidInput,
} from '@hello.nrfcloud.com/lambda-helpers/validateInput'
import { withDevice, type WithDevice } from '../middleware/withDevice.js'
import { validateDeviceJWT } from '../../jwt/validateDeviceJWT.js'
import { SSMClient } from '@aws-sdk/client-ssm'
import { fetchMapJWTPublicKeys } from '../map/fetchMapJWTPublicKeys.js'
import { once } from 'lodash-es'

const {
	tableName,
	deviceIdTimestampIndex,
	DevicesTableName,
	version,
	stackName,
} = fromEnv({
	version: 'VERSION',
	tableName: 'LOCATION_HISTORY_TABLE_NAME',
	deviceIdTimestampIndex: 'LOCATION_HISTORY_TABLE_DEVICE_ID_TIMESTAMP_INDEX',
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
	trail: Type.Optional(
		Type.Integer({
			minimum: 1,
			description:
				'Create a location trail with the minimum distance in kilometers.',
		}),
	),
})

const db = new DynamoDBClient({})
const ssm = new SSMClient({})

const mapJwtPublicKeys = once(async () =>
	fetchMapJWTPublicKeys({
		ssm,
		stackName,
		onError: (err, url) => console.error(`[fetchJWTPublicKeys]`, err, url),
		debug: console.debug,
	}),
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
			ObjectID: LwM2MObjectID.Geolocation_14201,
			ObjectVersion: definitions[LwM2MObjectID.Geolocation_14201].ObjectVersion,
			deviceId: context.device.id,
			binIntervalMinutes: timeSpan.binIntervalMinutes,
			ObjectInstanceID: 0, // Not used
		},
		partialInstances: [],
	}

	let from = new Date(Date.now() - timeSpan.durationHours * 60 * 60 * 1000)
	if (
		context.device.hideDataBefore !== undefined &&
		context.device.hideDataBefore > from
	) {
		from = context.device.hideDataBefore
	}

	const Query: QueryCommandInput = {
		TableName: tableName,
		IndexName: deviceIdTimestampIndex,
		KeyConditionExpression: '#deviceId = :deviceId AND #timestamp > :from',
		ExpressionAttributeNames: {
			'#deviceId': 'deviceId',
			'#source': 'source',
			'#lat': 'lat',
			'#lon': 'lon',
			'#uncertainty': 'uncertainty',
			'#timestamp': 'timestamp',
		},
		ExpressionAttributeValues: {
			':deviceId': {
				S: context.device.id,
			},
			':from': {
				S: from.toISOString(),
			},
		},
		ProjectionExpression: '#source, #lat, #lon, #uncertainty, #timestamp',
	}
	console.log('Query', JSON.stringify(Query))

	const maybeItems = await db.send(new QueryCommand(Query))

	console.log('Items', JSON.stringify(maybeItems.Items))

	const history = (maybeItems.Items?.map((item) => unmarshall(item)) ?? []).map(
		(item) => ({
			'0': item.lat as number,
			'1': item.lon as number,
			'3': item.uncertainty as number,
			'6': item.source as string,
			'99': Math.floor(new Date(item.timestamp).getTime() / 1000),
		}),
	)

	if (context.validInput.trail !== undefined) {
		result.partialInstances = createTrailOfCoordinates(
			context.validInput.trail,
			history.map(({ '0': lat, '1': lng, 99: ts, 6: source }) => ({
				lat,
				lng,
				ts,
				source,
			})),
		).map(({ lat, lng, ts, radiusKm, sources }) => ({
			'0': lat,
			'1': lng,
			'3': radiusKm * 1000,
			'6': sources.size === 1 ? sources.values().next().value : 'mixed',
			'99': ts,
		}))
	} else {
		result.partialInstances = history
	}

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
	.use(
		validateInput(InputSchema, (event) => {
			const { deviceId } = event.pathParameters ?? {}
			const { trail } = event.queryStringParameters ?? {}
			return {
				...(event.queryStringParameters ?? {}),
				trail: trail !== undefined ? parseInt(trail, 10) : undefined,
				deviceId,
			}
		}),
	)
	.use(
		withDevice({
			db,
			DevicesTableName,
			validateDeviceJWT: async (token: string) =>
				validateDeviceJWT(await mapJwtPublicKeys())(token),
		}),
	)
	.handler(h)
