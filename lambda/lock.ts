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
	acquiredLock: (name: string, ttl: number) => Promise<boolean>
	releaseLock: (name: string) => Promise<void>
} = (db: DynamoDBClient, tableName: string) => {
	const acquiredLock = async (name: string, ttl: number) => {
		const currentTime = Date.now()
		const timeToLive = currentTime + ttl

		try {
			await db.send(
				new PutItemCommand({
					TableName: tableName,
					Item: {
						lockName: { S: name },
						ownerId: { S: process.pid.toString() },
						ttl: { N: timeToLive.toString() },
					},
					ConditionExpression: 'attribute_not_exists(lockName)',
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
