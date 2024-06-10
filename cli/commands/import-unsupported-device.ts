import { type DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { isFingerprint } from '@hello.nrfcloud.com/proto/fingerprint'
import chalk from 'chalk'
import { registerUnsupportedDevice } from '../../devices/registerUnsupportedDevice.js'
import type { CommandDefinition } from './CommandDefinition.js'
import { isIMEI } from '../../devices/isIMEI.js'
import { readFile } from 'node:fs/promises'

export const importUnsupportedDevice = ({
	db,
	devicesTableName,
}: {
	db: DynamoDBClient
	devicesTableName: string
}): CommandDefinition => ({
	command: 'unsupported-device <deviceList>',
	help: 'Marks the fingerprint to belong to an unsupported device. The deviceList is expected to be a tab-separated list with IMEI and fingerprint',
	options: [
		{
			flags: '-w, --windows',
			description: `Use Windows line ends`,
		},
	],
	action: async (devicesList, { windows }) => {
		for (const [deviceId, fingerprint] of (await readFile(devicesList, 'utf-8'))
			.trim()
			.split(windows === true ? '\r\n' : '\n')
			.map((s) => s.trim().split('\t'))) {
			if (!isFingerprint(fingerprint)) {
				console.error(
					chalk.yellow('⚠️'),
					chalk.yellow(`Not a fingerprint:`),
					chalk.red(JSON.stringify(fingerprint)),
				)
				process.exit(1)
			}
			if (!isIMEI(deviceId)) {
				console.error(
					chalk.yellow('⚠️'),
					chalk.yellow(`Not an IMEI:`),
					chalk.red(JSON.stringify(deviceId)),
				)
				process.exit(1)
			}

			const res = await registerUnsupportedDevice({
				db,
				devicesTableName,
			})({
				fingerprint,
				id: deviceId,
			})
			if ('error' in res) {
				console.error(chalk.red(`Failed to store fingerprint!`))
				console.error(res.error.message)
			} else {
				console.log(
					chalk.green(`Marked fingerprint as unsupported:`),
					chalk.cyan(fingerprint),
					chalk.blue(deviceId),
				)
			}
		}
	},
})
