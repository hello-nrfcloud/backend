import {
	DynamoDBClient,
	type ScanInput,
	type ScanOutput,
} from '@aws-sdk/client-dynamodb'
import assert from 'assert'
import { describe, it, mock } from 'node:test'
import { totalFingerprintsUsed } from './totalFingerprintsUsed.ts'

await describe('totalFingerprintsUsed()', async () => {
	await it('should return the total number of fingerprints used per model', async () => {
		const send = mock.fn<(args: { input: ScanInput }) => Promise<ScanOutput>>(
			async () => ({
				Items: [
					{
						model: { S: 'model1' },
						lastSeen: { S: '2023-01-01T12:34:56.000Z' },
					},
					{
						model: { S: 'model1' },
						lastSeen: { S: '2023-01-02T12:34:56.000Z' },
					},
					{
						model: { S: 'model2' },
						lastSeen: { S: '2023-01-01T12:34:56.000Z' },
					},
				],
			}),
		)
		const db = new DynamoDBClient({})
		db.send = send
		const TableName = 'test-table'

		const result = await totalFingerprintsUsed(db, TableName)()
		assert.deepStrictEqual(
			result,
			new Map([
				['model1', 2],
				['model2', 1],
			]),
		)

		assert.deepStrictEqual(send.mock.calls.length, 1)
		assert.deepEqual(send.mock.calls[0]!.arguments[0].input, {
			ExclusiveStartKey: undefined,
			Limit: undefined,
			TableName,
			ExpressionAttributeNames: {
				'#model': 'model',
				'#lastSeen': 'lastSeen',
			},
			ProjectionExpression: '#model',
			FilterExpression: 'attribute_exists(#lastSeen)',
		})
	})

	await it('should return an empty map if no items are found', async () => {
		const send = mock.fn<(args: { input: ScanInput }) => Promise<ScanOutput>>(
			async () => ({}),
		)
		const db = new DynamoDBClient({})
		db.send = send
		const TableName = 'test-table'

		const result = await totalFingerprintsUsed(db, TableName)()
		assert.deepStrictEqual(result, new Map())
		assert.equal(result.size, 0)
	})
})
