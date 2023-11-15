import {
	type DynamoDBClient,
	PutItemCommand,
	GetItemCommand,
	UpdateItemCommand,
} from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import { models } from '@hello.nrfcloud.com/proto-lwm2m'
import { consentDurationMS, consentDurationSeconds } from './consentDuration.js'
import { generateCode } from '../cli/devices/generateCode.js'
import { randomWords } from '@nordicsemiconductor/random-words'

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
	ownershipConfirmationToken: string
	ownershipConfirmationTokenCreated: Date
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
	now,
}: {
	db: DynamoDBClient
	TableName: string
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
	share: (args: {
		deviceId: string
		model: string
		email: string
		generateToken?: () => string
	}) => Promise<
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
		deviceId: string
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
	share: async ({ deviceId, model, email, generateToken }) => {
		const id = randomWords({ numWords: 3 }).join('-')
		const ownershipConfirmationToken = generateToken?.() ?? generateCode()

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
						ownershipConfirmationTokenCreated: (
							now ?? new Date()
						).toISOString(),
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
				ownershipConfirmationToken,
			},
		}
	},
	confirmOwnership: async ({ deviceId, ownershipConfirmationToken }) => {
		try {
			await db.send(
				new UpdateItemCommand({
					TableName,
					Key: marshall({
						secret__deviceId: deviceId,
					}),
					UpdateExpression: 'SET #ownerConfirmed = :now',
					ExpressionAttributeNames: {
						'#ownerConfirmed': 'ownerConfirmed',
						'#token': 'ownershipConfirmationToken',
					},
					ExpressionAttributeValues: {
						':now': {
							S: (now ?? new Date()).toISOString(),
						},
						':token': {
							S: ownershipConfirmationToken,
						},
					},
					ConditionExpression: '#token = :token',
				}),
			)
		} catch (err) {
			return { error: err as Error }
		}
		return { success: true }
	},
})
