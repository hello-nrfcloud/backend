import { SSMClient } from '@aws-sdk/client-ssm'
import chalk from 'chalk'
import { STACK_NAME } from '../../cdk/stacks/stackConfig.js'
import { hashSHA1 } from '../../util/hashSHA1.js'
import { deleteSettings, putSettings } from '../../util/settings.js'
import type { CommandDefinition } from './CommandDefinition.js'

export const setShadowFetcherCommand = ({
	ssm,
}: {
	ssm: SSMClient
}): CommandDefinition => ({
	command: 'set-shadow-fetcher-config <model> [value]',
	options: [
		{
			flags: '-X, --deleteFetcherConfig',
			description: 'Deletes shadow fetcher.',
		},
	],
	action: async (model: string, value: string, { deleteFetcherConfig }) => {
		const modelHash = model === 'default' ? model : hashSHA1(model)
		if (deleteFetcherConfig !== undefined) {
			// Delete
			const { name } = await deleteSettings({
				ssm,
				stackName: STACK_NAME,
				scope: 'config',
				system: 'stack',
			})({
				property: modelHash,
			})
			console.log()
			console.log(
				chalk.green('Deleted the parameters from'),
				chalk.blueBright(name),
			)
			return
		}

		if (value === undefined || value.length === 0) {
			throw new Error(`Must provide value!`)
		}

		const { name } = await putSettings({
			ssm,
			stackName: STACK_NAME,
			scope: 'config',
			system: 'stack',
		})({
			property: modelHash,
			value,
		})

		console.log()
		console.log(
			chalk.green('Updated the configuration'),
			chalk.blueBright(name),
			chalk.green('to'),
			chalk.yellow(value),
		)
	},
	help: 'Configure the shadow fetcher.',
})
