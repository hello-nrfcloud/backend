import {
	ConditionalCheckFailedException,
	DeleteItemCommand,
	PutItemCommand,
	type DynamoDBClient,
} from '@aws-sdk/client-dynamodb'

export const createLock: (
	db: DynamoDBClient,
	tableName: string,
) => {
	acquiredLock: (name: string, ttlSeconds: number) => Promise<boolean>
	releaseLock: (name: string) => Promise<void>
} = (db: DynamoDBClient, tableName: string) => {
	const acquiredLock = async (name: string, ttlSeconds: number) => {
		const currentTime = Math.floor(Date.now() / 1000)
		const timeToLive = currentTime + ttlSeconds

		try {
			await db.send(
				new PutItemCommand({
					TableName: tableName,
					Item: {
						lockName: { S: name },
						ownerId: { S: process.pid.toString() },
						ttl: { N: timeToLive.toString() },
					},
					ExpressionAttributeNames: {
						'#ttlName': 'ttl',
					},
					ExpressionAttributeValues: {
						':currentTime': { N: currentTime.toString() },
					},
					ConditionExpression:
						'attribute_not_exists(lockName) OR #ttlName < :currentTime',
				}),
			)

			return true
		} catch (error) {
			if (error instanceof ConditionalCheckFailedException) {
				return false
			}

			throw error
		}
	}

	const releaseLock = async (name: string) => {
		await db.send(
			new DeleteItemCommand({
				TableName: tableName,
				Key: {
					lockName: { S: name },
				},
			}),
		)
	}

	return {
		acquiredLock,
		releaseLock,
	}
}
