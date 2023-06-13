import { type DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { registerDevice } from '../../devices/register-device.js'
import type { CommandDefinition } from './CommandDefinition.js'

export const registerDeviceCommand = ({
	db,
	devicesTableName,
}: {
	db: DynamoDBClient
	devicesTableName: string
}): CommandDefinition => ({
	command: 'register-device <deviceId> <fingerprint> <model>',
	action: async (deviceId, fingerprint, model) => {
		const res = await registerDevice({ db, devicesTableName })({
			id: deviceId,
			model,
			fingerprint,
		})
		if ('error' in res) {
			throw new Error(`Failed to register device: ${res.error.message}!`)
		}
		console.log(`Registered device ${deviceId}`)
	},
	help: 'Register a new device',
})
