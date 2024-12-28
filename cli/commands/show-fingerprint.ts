import { type DynamoDBClient } from '@aws-sdk/client-dynamodb'
import chalk from 'chalk'
import { getDeviceFingerprint } from '../../devices/getDeviceFingerprint.ts'
import type { CommandDefinition } from './CommandDefinition.ts'

export const showFingerprintCommand = ({
	db,
	devicesTableName,
}: {
	db: DynamoDBClient
	devicesTableName: string
}): CommandDefinition => ({
	command: 'show-fingerprint <deviceId>',
	action: async (deviceId) => {
		const maybeDevice = await getDeviceFingerprint({
			db,
			devicesTableName,
		})(deviceId)

		if ('error' in maybeDevice) {
			console.error(chalk.red('⚠️'), '', chalk.red(maybeDevice.error.message))
			process.exit(1)
		}

		const { fingerprint } = maybeDevice

		console.log(chalk.yellow(deviceId), chalk.blue(fingerprint))
	},
	help: 'Show the fingerprint of a device',
})
