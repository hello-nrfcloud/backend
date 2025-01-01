import { type DynamoDBClient, paginateScan } from '@aws-sdk/client-dynamodb'
import { unmarshall } from '@aws-sdk/util-dynamodb'

/**
 * Returns the total number of fingerprints used per model.
 */
export const totalFingerprintsUsed =
	(db: DynamoDBClient, TableName: string) =>
	async (): Promise<Map<string, number>> => {
		const results = paginateScan(
			{ client: db },
			{
				TableName,
				ExpressionAttributeNames: {
					'#model': 'model',
					'#lastSeen': 'lastSeen',
				},
				ProjectionExpression: '#model',
				FilterExpression: 'attribute_exists(#lastSeen)',
			},
		)
		const countPerModel = new Map<string, number>()
		for await (const { Items } of results) {
			for (const item of (Items ?? []).map((i) => unmarshall(i))) {
				countPerModel.set(item.model, (countPerModel.get(item.model) ?? 0) + 1)
			}
		}
		return countPerModel
	}
