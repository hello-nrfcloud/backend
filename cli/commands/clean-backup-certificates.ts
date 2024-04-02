import {
	DeleteParametersCommand,
	GetParametersByPathCommand,
	SSMClient,
} from '@aws-sdk/client-ssm'
import chalk from 'chalk'
import { chunk } from 'lodash-es'
import { STACK_NAME } from '../../cdk/stacks/stackConfig.js'
import { Scope, settingsPath } from '../../settings/settings.js'
import type { CommandDefinition } from './CommandDefinition.js'

export const cleanBackupCertificates = ({
	ssm,
}: {
	ssm: SSMClient
}): CommandDefinition => ({
	command: 'clean-backup-certificates',
	action: async () => {
		console.debug(chalk.magenta(`Deleting backup certificates`))
		for (const scope of [
			Scope.NRFCLOUD_BRIDGE_CERTIFICATE_CA,
			Scope.NRFCLOUD_BRIDGE_CERTIFICATE_MQTT,
		]) {
			const parameters = await ssm.send(
				new GetParametersByPathCommand({
					Path: settingsPath({
						stackName: STACK_NAME,
						scope,
					}),
					Recursive: true,
				}),
			)

			const names = [...(parameters.Parameters?.map((p) => p.Name) ?? [])]
			const namesChunk = chunk(names, 10)
			for (const names of namesChunk) {
				await ssm.send(
					new DeleteParametersCommand({
						Names: names as string[],
					}),
				)
			}
		}
	},
	help: 'Clean backup certificates on SSM',
})
