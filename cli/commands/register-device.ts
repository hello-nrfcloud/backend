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
	command:
		'register-device <account> <fingerprint> <deviceId> <model> <hwVersion>',
	action: async (account, fingerprint, deviceId, model, hwVersion) => {
		const res = await registerDevice({ db, devicesTableName })({
			id: deviceId,
			model,
			fingerprint,
			account,
			hwVersion,
		})
		if ('error' in res) {
			throw new Error(`Failed to register device: ${res.error.message}!`)
		}
		console.log(chalk.green('Registered device'), chalk.blue(deviceId))
	},
	help: 'Register a new device',
})
