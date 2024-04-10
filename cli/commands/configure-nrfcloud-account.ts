import { SSMClient } from '@aws-sdk/client-ssm'
import chalk from 'chalk'
import fs from 'fs'
import { STACK_NAME } from '../../cdk/stacks/stackConfig.js'
import type { CommandDefinition } from './CommandDefinition.js'
import {
	deleteSettings,
	putSetting,
	type Settings,
} from '@hello.nrfcloud.com/nrfcloud-api-helpers/settings'

export const configureRFCloudAccountCommand = ({
	ssm,
}: {
	ssm: SSMClient
}): CommandDefinition => ({
	command: 'configure-nrfcloud-account <account> <property> [value]',
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
		account: string,
		property: string,
		value: string | undefined,
		{ deleteBeforeUpdate, deleteParameter },
	) => {
		if (deleteParameter !== undefined) {
			// Delete
			const { name } = await deleteSettings({
				ssm,
				stackName: STACK_NAME,
				account,
			})(property)
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

		const { name } = await putSetting({
			ssm,
			stackName: STACK_NAME,
			account,
		})(property as keyof Settings, v, deleteBeforeUpdate)

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
