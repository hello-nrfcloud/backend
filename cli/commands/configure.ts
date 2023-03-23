import { SSMClient } from '@aws-sdk/client-ssm'
import chalk from 'chalk'
import fs from 'fs'
import { STACK_NAME } from '../../cdk/stacks/stackConfig.js'
import { deleteSettings, putSettings } from '../../util/settings.js'
import type { CommandDefinition } from './CommandDefinition.js'

export const configureCommand = ({
	ssm,
}: {
	ssm: SSMClient
}): CommandDefinition => ({
	command: 'configure <scope> <system> <property> [value]',
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
		scope: any,
		system: any,
		property: string,
		value: string | undefined,
		{ deleteBeforeUpdate, deleteParameter },
	) => {
		if (deleteParameter !== undefined) {
			// Delete
			const { name } = await deleteSettings({
				ssm,
				stackName: STACK_NAME,
				scope,
				system,
			})({
				property,
			})
			console.log()
			console.log(
				chalk.green('Deleted the parameters from'),
				chalk.blueBright(name),
			)
			return
		}

		const v = value ?? fs.readFileSync(0, 'utf-8')
		if (v === undefined || v.length === 0) {
			throw new Error(`Must provide value either as argument or via stdin!`)
		}

		const { name } = await putSettings({
			ssm,
			stackName: STACK_NAME,
			scope,
			system,
		})({
			property,
			value: v,
			deleteBeforeUpdate,
		})

		console.log()
		console.log(
			chalk.green('Updated the configuration'),
			chalk.blueBright(name),
			chalk.green('to'),
			chalk.yellow(v),
		)
	},
	help: 'Configure the system. If value is not provided, it is read from stdin',
})
