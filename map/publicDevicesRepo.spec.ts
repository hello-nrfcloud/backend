import { describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'
import { publicDevicesRepo } from './publicDevicesRepo.js'
import { marshall } from '@aws-sdk/util-dynamodb'
import { assertCall } from '../util/test/assertCall.js'
import { randomUUID } from 'node:crypto'
import { consentDurationSeconds } from './consentDuration.js'
import { generateCode, alphabet, numbers } from '../cli/devices/generateCode.js'

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
				now,
			}).share({
				deviceId: 'some-device',
				model: 'asset_tracker_v2+AWS',
				email: 'alex@example.com',
			})

			const id = ('publicDevice' in res && res.publicDevice.id) as string

			assert.match(id, /^[a-z0-9]{8}-[a-z0-9]{8}-[a-z0-9]{8}$/) // e.g. mistrist-manicate-lunation

			assertCall(send, {
				input: {
					TableName: 'some-table',
					Item: marshall({
						secret__deviceId: 'some-device',
						id,
						ttl: Math.round(now.getTime() / 1000) + consentDurationSeconds,
						ownerEmail: 'alex@example.com',
					}),
				},
			})

			assert.match(
				(send.mock.calls[0]?.arguments as any)?.[0]?.input.Item
					.ownershipConfirmationToken.S,
				new RegExp(`^[${alphabet.toUpperCase()}${numbers}]{6}$`),
				'A code should have been generated.',
			)
		})
	})

	void describe('confirmOwnership()', () => {
		void it('should confirm the ownership by a user', async () => {
			const id = randomUUID()
			const ownershipConfirmationToken = generateCode()

			const send = mock.fn(async () =>
				Promise.resolve({
					Attributes: marshall({ id }),
				}),
			)

			const now = new Date()

			const res = await publicDevicesRepo({
				db: {
					send,
				} as any,
				TableName: 'some-table',
				now,
			}).confirmOwnership({
				deviceId: id,
				ownershipConfirmationToken,
			})

			assert.deepEqual(res, {
				publicDevice: {
					id,
				},
			})

			assertCall(send, {
				input: {
					TableName: 'some-table',
					Key: {
						secret__deviceId: { S: id },
					},
					UpdateExpression: 'SET #ownerConfirmed = :now',
					ExpressionAttributeNames: {
						'#ownerConfirmed': 'ownerConfirmed',
						'#token': 'ownershipConfirmationToken',
					},
					ExpressionAttributeValues: {
						':now': { S: now.toISOString() },
						':token': { S: ownershipConfirmationToken },
					},
					ConditionExpression: '#token = :token',
					ReturnValues: 'ALL_NEW',
				},
			})
		})
	})
})
