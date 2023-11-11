import { describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'
import { publicDevicesRepo } from './publicDevicesRepo.js'
import { marshall } from '@aws-sdk/util-dynamodb'
import { assertCall } from '../util/test/assertCall.js'
import { randomUUID } from 'node:crypto'
import { ulid } from '../util/ulid.js'

void describe('publicDevicesRepo()', () => {
	void describe('getByDeviceId()', () => {
		void it('should fetch device data', async () => {
			const id = randomUUID()
			const send = mock.fn(async () =>
				Promise.resolve({
					Item: marshall({
						id,
						secret__deviceId: 'some-device',
						model: 'asset_tracker_v2+AWS',
						ownerConfirmed: new Date().toISOString(),
					}),
				}),
			)
			assert.deepEqual(
				await publicDevicesRepo({
					db: {
						send,
					} as any,
					TableName: 'some-table',
					IdIndexName: 'id-index',
				}).getByDeviceId('some-device'),
				{
					publicDevice: {
						id,
						model: 'asset_tracker_v2+AWS',
					},
				},
			)
			assertCall(send, {
				input: {
					TableName: 'some-table',
					Key: { secret__deviceId: { S: 'some-device' } },
				},
			})
		})

		void it('should return error if device is not found', async () =>
			assert.deepEqual(
				await publicDevicesRepo({
					db: {
						send: async () => Promise.resolve({}),
					} as any,
					TableName: 'some-table',
					IdIndexName: 'id-index',
				}).getByDeviceId('some-device'),
				{ error: 'not_found' },
			))
	})

	void describe('share()', () => {
		void it('should persist a users intent to share a device', async () => {
			const send = mock.fn(async () => Promise.resolve({}))
			const now = new Date()

			const res = await publicDevicesRepo({
				db: {
					send,
				} as any,
				TableName: 'some-table',
				IdIndexName: 'id-index',
				now,
			}).share({
				deviceId: 'some-device',
				model: 'asset_tracker_v2+AWS',
				email: 'alex@example.com',
			})

			const id = ('publicDevice' in res && res.publicDevice.id) as string

			assert.match(
				id,
				/^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/,
			)

			assertCall(send, {
				input: {
					TableName: 'some-table',
					Item: marshall({
						secret__deviceId: 'some-device',
						id,
						ttl: Math.round(now.getTime() / 1000) + 30 * 24 * 60 * 60,
						ownerEmail: 'alex@example.com',
						// ownershipConfirmationToken: generateCode(),
					}),
				},
			})

			assert.match(
				(send.mock.calls[0]?.arguments as any)?.[0]?.input.Item
					.ownershipConfirmationToken.S,
				/[ABCDEFGHIJKMNPQRSTUVWXYZ2-9]{6}/i,
				'A code should have been generated.',
			)
		})
	})

	void describe('confirmOwnership()', () => {
		void it('should confirm the ownership by a user', async () => {
			const id = randomUUID()
			const ownershipConfirmationToken = ulid()

			const send = mock.fn()
			send.mock.mockImplementationOnce(
				async () =>
					Promise.resolve({
						Items: [
							marshall({
								secret__deviceId: 'some-id',
								id,
								model: 'asset_tracker_v2+AWS',
							}),
						],
					}),
				0,
			)
			send.mock.mockImplementationOnce(
				async () =>
					Promise.resolve({
						Item: marshall({
							secret__deviceId: 'some-id',
							id,
							model: 'asset_tracker_v2+AWS',
							ownershipConfirmationToken,
						}),
					}),
				1,
			)

			const now = new Date()

			const res = await publicDevicesRepo({
				db: {
					send,
				} as any,
				TableName: 'some-table',
				IdIndexName: 'id-index',
				now,
			}).confirmOwnership({
				id,
				ownershipConfirmationToken: ownershipConfirmationToken.slice(-6),
			})

			assert.deepEqual(res, { success: true })

			assertCall(send, {
				input: {
					TableName: 'some-table',
					IndexName: 'id-index',
					KeyConditionExpression: '#id = :id',
					ExpressionAttributeNames: { '#id': 'id' },
					ExpressionAttributeValues: {
						':id': { S: id },
					},
				},
			})

			assertCall(
				send,
				{
					input: {
						TableName: 'some-table',
						Key: marshall({
							secret__deviceId: 'some-id',
						}),
					},
				},
				1,
			)
		})
	})
})
