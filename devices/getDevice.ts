import { QueryCommand, type DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { unmarshall } from '@aws-sdk/util-dynamodb'

export type Device = {
	id: string
	fingerprint: string
	model: string
	account: string
}

export const getDevice =
	({
		db,
		devicesTableName,
		devicesIndexName,
	}: {
		db: DynamoDBClient
		devicesTableName: string
		devicesIndexName: string
	}) =>
	async ({
		fingerprint,
	}: {
		fingerprint: string
	}): Promise<
		| {
				device: Device
		  }
		| { error: Error }
	> => {
		try {
			const { Items } = await db.send(
				new QueryCommand({
					TableName: devicesTableName,
					IndexName: devicesIndexName,
					KeyConditionExpression: '#fingerprint = :fingerprint',
					ExpressionAttributeNames: {
						'#fingerprint': 'fingerprint',
					},
					ExpressionAttributeValues: {
						':fingerprint': {
							S: fingerprint,
						},
					},
				}),
			)

			if (Items?.[0] === undefined)
				return {
					error: new Error(`Device with fingerprint ${fingerprint} not found.`),
				}
			const device = unmarshall(Items[0]) as {
				deviceId: string
				fingerprint: string
				model: string
				account: string
			}
			return {
				device: {
					id: device.deviceId,
					model: device.model,
					fingerprint: device.fingerprint,
					account: device.account,
				},
			}
		} catch (error) {
			return { error: error as Error }
		}
	}
