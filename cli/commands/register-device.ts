import { type DynamoDBClient } from '@aws-sdk/client-dynamodb'
import chalk from 'chalk'
import { registerDevice } from '../../devices/registerDevice.js'
import type { CommandDefinition } from './CommandDefinition.js'

export const registerDeviceCommand = ({
	db,
	devicesTableName,
}: {
	db: DynamoDBClient
	devicesTableName: string
}): CommandDefinition => ({
	command: 'register-device <fingerprint> <deviceId> <model>',
	action: async (fingerprint, deviceId, model) => {
		const res = await registerDevice({ db, devicesTableName })({
			id: deviceId,
			model,
			fingerprint,
		})
		if ('error' in res) {
			throw new Error(`Failed to register device: ${res.error.message}!`)
		}
		console.log(chalk.green('Registered device'), chalk.blue(deviceId))
	},
	help: 'Register a new device',
})
