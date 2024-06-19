import type { SSMClient } from '@aws-sdk/client-ssm'
import chalk from 'chalk'
import type { CommandDefinition } from './CommandDefinition.js'
import {
	deleteMemfaultSettings as deleteSettings,
	setMemfaultSettings as putSetting,
	type Settings,
} from '../../settings/memfault.js'

export const configureMemfaultCommand = ({
	ssm,
	stackName,
}: {
	ssm: SSMClient
	stackName: string
}): CommandDefinition => ({
	command: 'configure-memfault <property> [value]',
	options: [
		{
			flags: '-d, --deleteBeforeUpdate',
			description: `Useful when depending on the parameter having version 1, e.g. for use in CloudFormation`,
		},
		{
			flags: '-X, --deleteParameter',
			description: 'Deletes the parameter.',
		},
	],
	action: async (
		property: keyof Settings,
		value: string | undefined,
		{ deleteBeforeUpdate, deleteParameter },
	) => {
		if (deleteParameter !== undefined) {
			// Delete
			const { name } = await deleteSettings({
				ssm,
				stackName,
			})(property)
			console.log()
			console.log(
				chalk.green('Deleted the parameters from'),
				chalk.blueBright(name),
			)
			return
		}

		if (value === undefined || value.length === 0) {
			throw new Error(`Must provide value either as argument or via stdin!`)
		}

		const { name } = await putSetting({
			ssm,
			stackName,
		})(
			property,
			property === 'apiEndpoint' ? new URL(value) : value,
			deleteBeforeUpdate,
		)

		console.log()
		console.log(
			chalk.green('Updated the configuration'),
			chalk.blueBright(name),
			chalk.green('to'),
			chalk.yellow(value),
		)
	},
	help: 'Configure the Memfault feature.',
})
