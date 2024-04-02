import { SSMClient } from '@aws-sdk/client-ssm'
import chalk from 'chalk'
import { STACK_NAME } from '../../cdk/stacks/stackConfig.js'
import { hashSHA1 } from '../../util/hashSHA1.js'
import { Scope, deleteSettings, putSettings } from '../../settings/settings.js'
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
		value = value.trim()
		const modelHash = model === 'default' ? model : hashSHA1(model)
		if (deleteFetcherConfig !== undefined) {
			// Delete
			const { name } = await deleteSettings({
				ssm,
				stackName: STACK_NAME,
				scope: Scope.STACK_CONFIG,
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

		if (!/^(?:[1-9]\d*(:[1-9]\d*)?(\s*,\s*)?)+$/.test(value)) {
			throw new Error(
				`Invalid value. It should be in format: <interval> or <interval>:<count> or <interval>:<count>, <interval>:<count>, ...`,
			)
		}

		const { name } = await putSettings({
			ssm,
			stackName: STACK_NAME,
			scope: Scope.STACK_CONFIG,
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
