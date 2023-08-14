import {
	ResourceNotFoundException,
	type DynamoDBClient,
} from '@aws-sdk/client-dynamodb'
import { get, store } from './SingleCellGeoLocationCache.js'

describe('SingleCellGeoLocationCache()', () => {
	describe('get()', () => {
		it('should return null if cell is not cached', async () => {
			const db: DynamoDBClient = {
				send: jest.fn(() => {
					throw new ResourceNotFoundException({
						message: ` Requested resource not found`,
						$metadata: {},
					})
				}),
			} as any

			expect(
				await get({
					db,
					TableName: 'cacheTable',
				})({
					area: 42,
					mccmnc: 53005,
					cell: 666,
				}),
			).toEqual(null)
			expect(db.send).toHaveBeenCalledWith(
				expect.objectContaining({
					input: {
						Key: {
							cellId: {
								S: '53005-42-666',
							},
						},
						TableName: 'cacheTable',
					},
				}),
			)
		})

		it('should return the location if the cell is cached', async () => {
			const db: DynamoDBClient = {
				send: jest.fn(() => ({
					$metadata: {
						httpStatusCode: 200,
						requestId: 'SHTTK1LO0ELJ5LI2U0LUJOUBOJVV4KQNSO5AEMVJF66Q9ASUAAJG',
						extendedRequestId: undefined,
						cfId: undefined,
						attempts: 1,
						totalRetryDelay: 0,
					},
					Item: {
						cellId: { S: '53005-42-666' },
						lat: { N: '-36.87313199' },
						lng: { N: '174.7577405' },
						accuracy: { N: '510' },
					},
				})),
			} as any
			expect(
				await get({
					db,
					TableName: 'cacheTable',
				})({
					area: 42,
					mccmnc: 53005,
					cell: 666,
				}),
			).toEqual({ accuracy: 510, lat: -36.87313199, lng: 174.7577405 })
			expect(db.send).toHaveBeenCalledWith(
				expect.objectContaining({
					input: {
						Key: {
							cellId: {
								S: '53005-42-666',
							},
						},
						TableName: 'cacheTable',
					},
				}),
			)
		})
	})
	describe('store()', () => {
		it('should store the cell', async () => {
			const db: DynamoDBClient = {
				send: jest.fn(),
			} as any
			await store({
				db,
				TableName: 'cacheTable',
			})(
				{
					area: 42,
					mccmnc: 53005,
					cell: 666,
				},
				{ accuracy: 510, lat: -36.87313199, lng: 174.7577405 },
			)
			expect(db.send).toHaveBeenCalledWith(
				expect.objectContaining({
					input: {
						Item: {
							accuracy: { N: '510' },
							cellId: { S: '53005-42-666' },
							lat: { N: '-36.87313199' },
							lng: { N: '174.7577405' },
							ttl: {
								N: `${Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60}`,
							},
						},
						TableName: 'cacheTable',
					},
				}),
			)
		})
	})
})
