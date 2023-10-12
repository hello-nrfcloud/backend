import type { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { store, get } from './deviceShadowRepo.js'
import type { DeviceShadowType } from './DeviceShadow'
import { check, objectMatching } from 'tsmatchers'
import { marshall } from '@aws-sdk/util-dynamodb'
import { ResourceNotFoundException } from '@aws-sdk/client-iot'

const shadow: DeviceShadowType = {
	id: 'someId',
	tags: ['configuration:solar-shield', 'model:PCA20035'],
	tenantId: 'a0673464-e4e1-4b87-bffd-6941a012067b',
	$meta: {
		updatedAt: '2023-04-20T07:29:46.467Z',
		createdAt: '2023-04-19T11:49:07.370Z',
	},
	name: 'someId',
	type: 'Generic',
	subType: 'PCA10090',
	firmware: {
		supports: ['MODEM', 'APP'],
		app: {
			name: 'asset_tracker_v2',
			version: '1.10.0+thingy91.low-power.solar.memfault.nrfcloud',
		},
		modem: 'mfw_nrf9160_1.3.4',
	},
	state: {
		reported: {
			config: {
				activeMode: false,
				locationTimeout: 300,
				activeWaitTime: 120,
				movementResolution: 120,
				movementTimeout: 3600,
				accThreshAct: 4,
				accThreshInact: 4,
				accTimeoutInact: 60,
				nod: [],
			},
		},
		version: 8835,
		metadata: {
			reported: {
				config: {
					activeMode: {
						timestamp: 1681975785,
					},
					locationTimeout: {
						timestamp: 1681975785,
					},
					activeWaitTime: {
						timestamp: 1681975785,
					},
					movementResolution: {
						timestamp: 1681975785,
					},
					movementTimeout: {
						timestamp: 1681975785,
					},
					accThreshAct: {
						timestamp: 1681975785,
					},
					accThreshInact: {
						timestamp: 1681975785,
					},
					accTimeoutInact: {
						timestamp: 1681975785,
					},
					nod: [],
				},
			},
		},
	},
} as any

describe('deviceShadowRepository', () => {
	describe('store()', () => {
		it('should store a shadow', async () => {
			const send = jest.fn(async () => Promise.resolve())
			const db: DynamoDBClient = {
				send,
			} as any

			await store({ db, TableName: 'someTable' })(shadow)

			check((send.mock.calls as any)[0][0]).is(
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

	describe('get()', () => {
		it('should return null if shadow not found', async () => {
			const db: DynamoDBClient = {
				send: jest.fn(async () => {
					throw new ResourceNotFoundException({
						message: ` Requested resource not found`,
						$metadata: {},
					})
				}),
			} as any

			expect(
				await get({
					db,
					TableName: 'someTable',
				})('someId'),
			).toMatchObject({ shadow: null })
			expect(db.send).toHaveBeenCalledWith(
				expect.objectContaining({
					input: {
						Key: {
							deviceId: {
								S: 'someId',
							},
						},
						TableName: 'someTable',
					},
				}),
			)
		})

		it('should return the shadow if found', async () => {
			const db: DynamoDBClient = {
				send: jest.fn(async () => ({
					Item: marshall({
						deviceId: 'someId',
						shadow,
					}),
				})),
			} as any

			expect(
				await get({
					db,
					TableName: 'someTable',
				})('someId'),
			).toEqual({ shadow })
			expect(db.send).toHaveBeenCalledWith(
				expect.objectContaining({
					input: {
						Key: {
							deviceId: {
								S: 'someId',
							},
						},
						TableName: 'someTable',
					},
				}),
			)
		})
	})
})
