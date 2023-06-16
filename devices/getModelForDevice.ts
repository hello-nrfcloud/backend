import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb'
import { unmarshall } from '@aws-sdk/util-dynamodb'

export const getModelForDevice = ({
	db,
	DevicesTableName,
}: {
	db: DynamoDBClient
	DevicesTableName: string
}): ((deviceId: string) => Promise<{ model: string }>) => {
	const deviceModelPromises: Record<string, Promise<{ model: string }>> = {}
	return async (deviceId: string): Promise<{ model: string }> => {
		let p = deviceModelPromises[deviceId]
		if (p === undefined) {
			p = db
				.send(
					new QueryCommand({
						TableName: DevicesTableName,
						KeyConditionExpression: '#deviceId = :deviceId',
						ExpressionAttributeNames: {
							'#deviceId': 'deviceId',
						},
						ExpressionAttributeValues: {
							':deviceId': {
								S: deviceId,
							},
						},
					}),
				)
				.then((res) => ({
					model:
						res.Items?.[0] !== undefined
							? (unmarshall(res.Items[0]).model as string)
							: 'default',
				}))
			deviceModelPromises[deviceId] = p
		}
		return p
	}
}
