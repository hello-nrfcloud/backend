import {
	PutItemCommand,
	QueryCommand,
	type DynamoDBClient,
} from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import type { LwM2MObjectInstance } from '@hello.nrfcloud.com/proto-map'
import type { ValueError } from '@sinclair/typebox/errors'
import id128 from 'id128'

const sharedProps = (deviceId: string) => ({
	deviceId,
	importId: id128.Ulid.generate().toCanonical(),
	timestamp: Date.now(),
	ttl: Math.round(Date.now() / 1000) + 60 * 60 * 24 * 30,
})

type ImportLogsRepository = {
	recordError: (
		deviceId: string,
		senML: string | Record<string, any>,
		errors: (string | ValueError)[],
	) => Promise<void>
	recordSuccess: (
		deviceId: string,
		senML: string | Record<string, any>,
		lwm2m: Array<LwM2MObjectInstance>,
	) => Promise<void>
	findLogs: (deviceId: string) => Promise<
		Array<{
			importId: string
			timestamp: Date
			success: boolean
			senML: string | Record<string, any>
			lwm2m?: Array<LwM2MObjectInstance>
		}>
	>
}

export const importLogs = (
	db: DynamoDBClient,
	TableName: string,
): ImportLogsRepository => ({
	recordError: async (deviceId, senML, errors) => {
		await db.send(
			new PutItemCommand({
				TableName,
				Item: marshall({
					...sharedProps(deviceId),
					success: false,
					errors: JSON.stringify(errors),
					senML: JSON.stringify(senML),
				}),
			}),
		)
	},
	recordSuccess: async (deviceId, senML, lwm2m) => {
		await db.send(
			new PutItemCommand({
				TableName,
				Item: marshall({
					...sharedProps(deviceId),
					success: true,
					senML: JSON.stringify(senML),
					lwm2m: JSON.stringify(lwm2m),
				}),
			}),
		)
	},
	findLogs: async (deviceId) => {
		const { Items } = await db.send(
			new QueryCommand({
				TableName,
				KeyConditionExpression: '#deviceId = :deviceId',
				ExpressionAttributeNames: {
					'#deviceId': 'deviceId',
					'#importId': 'importId',
					'#timestamp': 'timestamp',
					'#success': 'success',
					'#errors': 'errors',
					'#senML': 'senML',
					'#lwm2m': 'lwm2m',
				},
				ExpressionAttributeValues: {
					':deviceId': {
						S: deviceId,
					},
				},
				ProjectionExpression:
					'#importId, #timestamp, #success, #errors, #senML, #lwm2m',
				Limit: 100,
				ScanIndexForward: false,
			}),
		)

		return (Items ?? []).map((item) => {
			const { importId, timestamp, success, errors, senML, lwm2m } =
				unmarshall(item)

			return {
				importId,
				timestamp: new Date(timestamp),
				success,
				senML: JSON.parse(senML),
				errors: errors !== undefined ? JSON.parse(errors) : undefined,
				lwm2m: lwm2m !== undefined ? JSON.parse(lwm2m) : undefined,
			} as any
		})
	},
})