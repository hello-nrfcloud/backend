import {
	type DynamoDBClient,
	PutItemCommand,
	GetItemCommand,
	QueryCommand,
	UpdateItemCommand,
} from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import { models } from '@hello.nrfcloud.com/proto-lwm2m'
import crypto from 'node:crypto'
import { ulid } from '../util/ulid.js'
import { consentDurationMS, consentDurationSeconds } from './consentDuration.js'

export type PublicDeviceRecord = {
	/**
	 * This is the public ID of the device, a UUIDv4.
	 * Only the public ID should be shown.
	 *
	 * @example "fbb18b8e-c2f9-41fe-8cfa-4107e4e54d72"
	 */
	id: string
	/**
	 * This is the ID the device uses to connect to nRF Cloud
	 *
	 * @example "oob-352656108602296"
	 */
	secret__deviceId: string
	model: keyof typeof models
	ownerEmail: string
	// This contains an ULID
	ownershipConfirmationToken: string
	ownerConfirmed?: Date
	ttl: number
}

export type PublicDeviceRecordById = Pick<
	PublicDeviceRecord,
	'id' | 'model' | 'ownerConfirmed' | 'secret__deviceId'
>

const modelNames = Object.keys(models)

export type PublicDevice = Pick<PublicDeviceRecord, 'id' | 'model'>

export const publicDevicesRepo = ({
	db,
	TableName,
	IdIndexName,
	now,
}: {
	db: DynamoDBClient
	TableName: string
	IdIndexName: string
	now?: Date
}): {
	getByDeviceId: (deviceId: string) => Promise<
		| { publicDevice: PublicDevice }
		| {
				error:
					| 'not_found'
					| 'not_confirmed'
					| 'confirmation_expired'
					| 'unsupported_model'
		  }
	>
	share: (args: { deviceId: string; model: string; email: string }) => Promise<
		| {
				error: Error
		  }
		| {
				publicDevice: {
					id: string
					ownershipConfirmationToken: string
				}
		  }
	>
	confirmOwnership: (args: {
		id: string
		ownershipConfirmationToken: string
	}) => Promise<
		| {
				error: Error
		  }
		| {
				success: true
		  }
	>
} => ({
	getByDeviceId: async (deviceId: string) => {
		const { Item } = await db.send(
			new GetItemCommand({
				TableName,
				Key: marshall({
					secret__deviceId: deviceId.toLowerCase(),
				}),
			}),
		)
		if (Item === undefined) return { error: 'not_found' }
		const device = unmarshall(Item)
		if (device.ownerConfirmed === undefined || device.ownerConfirmed === null)
			return { error: 'not_confirmed' }
		const ownerConfirmed = new Date(device.ownerConfirmed)
		if (ownerConfirmed.getTime() + consentDurationMS < Date.now())
			return { error: 'confirmation_expired' }
		if (!modelNames.includes(device.model))
			return { error: 'unsupported_model' }
		return {
			publicDevice: {
				id: device.id as string,
				model: device.model as keyof typeof models,
			},
		}
	},
	share: async ({ deviceId, model, email }) => {
		const id = crypto.randomUUID()
		const ownershipConfirmationToken = ulid()

		try {
			await db.send(
				new PutItemCommand({
					TableName,
					Item: marshall({
						secret__deviceId: deviceId.toLowerCase(),
						id,
						ttl:
							Math.round((now ?? new Date()).getTime() / 1000) +
							consentDurationSeconds,
						model,
						ownerEmail: email,
						ownershipConfirmationToken,
						ownerConfirmed: null,
					}),
					ConditionExpression: 'attribute_not_exists(secret__deviceId)',
				}),
			)
		} catch (err) {
			return {
				error: err as Error,
			}
		}

		return {
			publicDevice: {
				id,
				ownershipConfirmationToken: ownershipConfirmationToken.slice(-6),
			},
		}
	},
	confirmOwnership: async ({ id, ownershipConfirmationToken }) => {
		const { Items } = await db.send(
			new QueryCommand({
				TableName,
				IndexName: IdIndexName,
				KeyConditionExpression: '#id = :id',
				ExpressionAttributeNames: {
					'#id': 'id',
				},
				ExpressionAttributeValues: {
					':id': {
						S: id,
					},
				},
			}),
		)

		if (Items?.[0] === undefined)
			return {
				error: new Error(`Device ${id} not found.`),
			}
		const indexEntry = unmarshall(Items?.[0]) as PublicDeviceRecordById

		const { Item } = await db.send(
			new GetItemCommand({
				TableName,
				Key: marshall({
					secret__deviceId: indexEntry.secret__deviceId,
				}),
			}),
		)
		if (Item === undefined)
			return {
				error: new Error(`Device ${id} not found.`),
			}

		const device = unmarshall(Item) as PublicDeviceRecord
		if (
			device.ownershipConfirmationToken.slice(-6) !== ownershipConfirmationToken
		)
			return {
				error: new Error(
					`Invalid ownership confirmation token: ${ownershipConfirmationToken}!`,
				),
			}

		await db.send(
			new UpdateItemCommand({
				TableName,
				Key: marshall({
					secret__deviceId: device.secret__deviceId,
				}),
				UpdateExpression: 'SET #ownerConfirmed = :now',
				ExpressionAttributeNames: {
					'#ownerConfirmed': 'ownerConfirmed',
				},
				ExpressionAttributeValues: {
					':now': {
						S: (now ?? new Date()).toISOString(),
					},
				},
			}),
		)

		return { success: true }
	},
})
