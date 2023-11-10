import { describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'
import { ResourceNotFoundException } from '@aws-sdk/client-dynamodb'
import { get, store } from './SingleCellGeoLocationCache.js'
import { assertCall } from '../util/test/assertCall.js'

void describe('SingleCellGeoLocationCache()', () => {
	void describe('get()', () => {
		void it('should return null if cell is not cached', async () => {
			const send = mock.fn(async () =>
				Promise.reject(
					new ResourceNotFoundException({
						message: ` Requested resource not found`,
						$metadata: {},
					}),
				),
			)
			assert.equal(
				await get({
					db: { send } as any,
					TableName: 'cacheTable',
				})({
					area: 42,
					mccmnc: 53005,
					cell: 666,
				}),
				null,
			)
			assertCall(send, {
				input: {
					Key: {
						cellId: {
							S: '53005-42-666',
						},
					},
					TableName: 'cacheTable',
				},
			})
		})

		void it('should return the location if the cell is cached', async () => {
			const send = mock.fn(async () =>
				Promise.resolve({
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
				}),
			)
			assert.deepEqual(
				await get({
					db: { send } as any,
					TableName: 'cacheTable',
				})({
					area: 42,
					mccmnc: 53005,
					cell: 666,
				}),
				{ accuracy: 510, lat: -36.87313199, lng: 174.7577405 },
			)
			assertCall(send, {
				input: {
					Key: {
						cellId: {
							S: '53005-42-666',
						},
					},
					TableName: 'cacheTable',
				},
			})
		})
	})
	void describe('store()', () => {
		void it('should store the cell', async () => {
			const send = mock.fn(async () => Promise.resolve({}))
			await store({
				db: { send } as any,
				TableName: 'cacheTable',
			})(
				{
					area: 42,
					mccmnc: 53005,
					cell: 666,
				},
				{ accuracy: 510, lat: -36.87313199, lng: 174.7577405 },
			)
			assertCall(send, {
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
			})
		})
	})
})
