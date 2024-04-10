import { describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'
import type { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { store, get } from './deviceShadowRepo.js'
import { check, objectMatching } from 'tsmatchers'
import { marshall } from '@aws-sdk/util-dynamodb'
import { ResourceNotFoundException } from '@aws-sdk/client-iot'
import shadow from './test-data/deviceShadow.json'
import { assertCall } from '../util/test/assertCall.js'

void describe('deviceShadowRepository', () => {
	void describe('store()', () => {
		void it('should store a shadow', async () => {
			const send = mock.fn(async () => Promise.resolve())
			const db: DynamoDBClient = {
				send,
			} as any

			await store({ db, TableName: 'someTable' })(shadow)

			check((send.mock.calls[0]?.arguments as unknown[])[0]).is(
				objectMatching({
					input: {
						TableName: 'someTable',
						Item: marshall({
							deviceId: 'someId',
							shadow,
							ttl: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
						}),
					},
				}),
			)
		})
	})

	void describe('get()', () => {
		void it('should return null if shadow not found', async () => {
			const send = mock.fn(async () =>
				Promise.reject(
					new ResourceNotFoundException({
						message: ` Requested resource not found`,
						$metadata: {},
					}),
				),
			)
			assert.deepEqual(
				await get({
					db: { send } as any,
					TableName: 'someTable',
				})('someId'),
				{ shadow: null },
			)
			assertCall(send, {
				input: {
					Key: {
						deviceId: {
							S: 'someId',
						},
					},
					TableName: 'someTable',
				},
			})
		})

		void it('should return the shadow if found', async () => {
			const send = mock.fn(async () =>
				Promise.resolve({
					Item: marshall({
						deviceId: 'someId',
						shadow,
					}),
				}),
			)
			assert.deepEqual(
				await get({
					db: { send } as any,
					TableName: 'someTable',
				})('someId'),
				{ shadow },
			)
			assertCall(send, {
				input: {
					Key: {
						deviceId: {
							S: 'someId',
						},
					},
					TableName: 'someTable',
				},
			})
		})
	})
})
