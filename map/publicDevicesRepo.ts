import { type DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import type { models } from '@hello.nrfcloud.com/proto-lwm2m'

type PublicDeviceRecord = {
	/**
	 * This is the public ID of the device, a UUIDv4.
	 * Only the public ID should be shown.
	 *
	 * @example "fbb18b8e-c2f9-41fe-8cfa-4107e4e54d72"
	 */
	id: string
	/**
	 * This is the ID the device uses to connect to nRF Cloud
	 *
	 * @example "oob-352656108602296"
	 */
	deviceId: string
	model: keyof typeof models
	ownerEmail: string
	ttl: number
}

export type PublicDevice = Omit<PublicDeviceRecord, 'ownerEmail' | 'ttl'>

export const publicDevicesRepo = ({
	db,
	TableName,
}: {
	db: DynamoDBClient
	TableName: string
}): {
	getByDeviceId: (deviceId: string) => Promise<PublicDevice | null>
} => ({
	getByDeviceId: async (deviceId: string): Promise<PublicDevice | null> => {
		const { Items } = await db.send(
			new QueryCommand({
				TableName,
				IndexName: 'deviceId',
				KeyConditionExpression: '#deviceId = :deviceId',
				ExpressionAttributeNames: {
					'#deviceId': 'deviceId',
					'#id': 'id',
					'#model': 'model',
				},
				ExpressionAttributeValues: {
					':deviceId': {
						S: deviceId,
					},
				},
				ProjectionExpression: '#deviceId, #id, #model',
				Limit: 1,
			}),
		)
		if (Items?.[0] === undefined) return null
		return unmarshall(Items?.[0]) as PublicDevice
	},
})
