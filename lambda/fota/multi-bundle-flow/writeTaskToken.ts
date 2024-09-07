import type { AttributeValue, DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { UpdateItemCommand } from '@aws-sdk/client-dynamodb'

/**
 * Writes the task token for the wait task to the job table.
 */
export const writeTaskToken =
	({
		db,
		TableName,
		tokenName,
	}: {
		db: DynamoDBClient
		TableName: string
		tokenName: string
	}) =>
	async ({
		Key,
		taskToken,
	}: {
		Key: Record<string, AttributeValue>
		/**
		 * @example 'AQCoAAAAKgAAAAMAAAAAAAAAATMtqSk+vZO9rx7aBEJgUow2LaqrrrUJ3rLPekkMNW9S6KwAcvFFmIpbZaiCTKf5tYDR6jnYJ3ZSBTVbgS/hIWSujE45ADCCpPDy0ai0VWt/c/C/KCwRH+VpDdxWjEnbnqKC20jnkksrrLE3sw==qZqJRcRXUx9dtaLG7MT9PPee+t95xX0HpgvVOdRopvVRDbm9AWlAnfLiySVnCTvnBxCxDQlGZX9lW/Vcip01rqk+yHvK0J9XFWDjiU3pPu+xzsGAaOWQi2o68XCa1DtrgO706/Lw19+BB+JVgk6AZMSlszutKKdqNeQCXqmdImOuEBZi1GNvfuqEka2s3s6ePLolQwUxkl/b0Bq6+alawTueiVJTeO98m1IGpKgI5HFCQE3Ur+qB56S4yWMO2uv/hCwUP0imj5D3RWbcI53jtHENve+54TJtJ3zbPvrkBStUGNL9a/dIppFeXPeAVHw5hpEQW3oHFf3PmfUhoMwoz7m1thMpO2Eoo2Kfn43lLK1fNjyfzuv5QE4himO0oi1qPYbCil5yc9ttz27Qr6ZzkmIJId8cQZzCOPeUJEAMBLhspRA3X+CJcF4NPp9cD4PC53a+r+pv3+mpMh4M2T3BunZ0fQg/1QMjXAgWWykHWZTWvvfaBfDBTCq1px2zKpGSvnXRuFFCFijwKT/H8ozR'
		 */
		taskToken: string
	}): Promise<void> => {
		await db.send(
			new UpdateItemCommand({
				TableName,
				Key,
				UpdateExpression: 'SET #taskToken = :taskToken',
				ExpressionAttributeNames: {
					'#taskToken': tokenName,
				},
				ExpressionAttributeValues: {
					':taskToken': {
						S: taskToken,
					},
				},
			}),
		)
	}
