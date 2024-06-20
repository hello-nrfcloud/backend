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
import { createTrailOfCoordinates } from '../historical-data/createTrailOfCoordinates.js'
import { validateInput, type ValidInput } from '../middleware/validateInput.js'

const { tableName, deviceIdTimestampIndex, DevicesTableName, version } =
	fromEnv({
		version: 'VERSION',
		tableName: 'LOCATION_HISTORY_TABLE_NAME',
		deviceIdTimestampIndex: 'LOCATION_HISTORY_TABLE_DEVICE_ID_TIMESTAMP_INDEX',
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
	trail: Type.Optional(
		Type.Integer({
			minimum: 1,
			description:
				'Create a location trail with the minimum distance in kilometers.',
		}),
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
			ObjectID: LwM2MObjectID.Geolocation_14201,
			ObjectVersion: definitions[LwM2MObjectID.Geolocation_14201].ObjectVersion,
			deviceId: device.id,
			binIntervalMinutes: timeSpan.binIntervalMinutes,
			ObjectInstanceID: 0, // Not used
		},
		partialInstances: [],
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
				S: device.id,
			},
			':from': {
				S: new Date(
					Date.now() - timeSpan.durationHours * 60 * 60 * 1000,
				).toISOString(),
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

	if (event.validInput.trail !== undefined) {
		result.partialInstances = createTrailOfCoordinates(
			event.validInput.trail,
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
	.use(inputOutputLogger())
	.use(addVersionHeader(version))
	.use(corsOPTIONS('GET'))
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
	.handler(h)
