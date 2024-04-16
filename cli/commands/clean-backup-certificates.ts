import {
	DeleteParametersCommand,
	GetParametersByPathCommand,
	SSMClient,
} from '@aws-sdk/client-ssm'
import chalk from 'chalk'
import { chunk } from 'lodash-es'
import { STACK_NAME } from '../../cdk/stackConfig.js'
import { ScopeContexts } from '../../settings/scope.js'
import type { CommandDefinition } from './CommandDefinition.js'
import { settingsPath } from '@bifravst/aws-ssm-settings-helpers'

export const cleanBackupCertificates = ({
	ssm,
}: {
	ssm: SSMClient
}): CommandDefinition => ({
	command: 'clean-backup-certificates',
	action: async () => {
		console.debug(chalk.magenta(`Deleting backup certificates`))
		for (const scopeContext of [
			ScopeContexts.NRFCLOUD_BRIDGE_CERTIFICATE_CA,
			ScopeContexts.NRFCLOUD_BRIDGE_CERTIFICATE_MQTT,
		]) {
			const parameters = await ssm.send(
				new GetParametersByPathCommand({
					Path: settingsPath({
						stackName: STACK_NAME,
						...scopeContext,
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
