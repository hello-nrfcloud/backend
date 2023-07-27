import { CloudFormationClient } from '@aws-sdk/client-cloudformation'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { SSMClient } from '@aws-sdk/client-ssm'
import { stackOutput } from '@nordicsemiconductor/cloudformation-helpers'
import chalk from 'chalk'
import { program } from 'commander'
import type { StackOutputs } from '../cdk/stacks/BackendStack.js'
import { STACK_NAME } from '../cdk/stacks/stackConfig.js'
import psjon from '../package.json'
import type { CommandDefinition } from '../cli/commands/CommandDefinition'
import { migrateNRFCloudAccounts } from './commands/migrate-nrfcloud-account.js'

const ssm = new SSMClient({})
const db = new DynamoDBClient({})

const die = (err: Error, origin: any) => {
	console.error(`An unhandled exception occurred!`)
	console.error(`Exception origin: ${JSON.stringify(origin)}`)
	console.error(err)
	process.exit(1)
}

process.on('uncaughtException', die)
process.on('unhandledRejection', die)

console.log('')

const CLI = async () => {
	program.name('./cli.ts')
	program.description(
		`hello.nrfcloud.com migration ${psjon.version} Command Line Interface`,
	)
	program.version(psjon.version)

	const commands: CommandDefinition[] = []

	try {
		const outputs = await stackOutput(
			new CloudFormationClient({}),
		)<StackOutputs>(STACK_NAME)
		commands.push(
			migrateNRFCloudAccounts({
				ssm,
				db,
				stackName: STACK_NAME,
				devicesTableName: outputs.devicesTableName,
			}),
		)
	} catch (error) {
		console.warn(chalk.yellow('⚠️'), chalk.yellow((error as Error).message))
	}

	let ran = false
	commands.forEach(({ command, action, help, options }) => {
		const cmd = program.command(command)
		cmd
			.action(async (...args) => {
				try {
					ran = true
					await action(...args)
				} catch (error) {
					console.error(
						chalk.red.inverse(' ERROR '),
						chalk.red(`${command} failed!`),
					)
					console.error(chalk.red.inverse(' ERROR '), chalk.red(error))
					process.exit(1)
				}
			})
			.on('--help', () => {
				console.log('')
				console.log(chalk.yellow(help))
				console.log('')
			})
		if (options) {
			options.forEach(({ flags, description, defaultValue }) =>
				cmd.option(flags, description, defaultValue),
			)
		}
	})

	program.parse(process.argv)

	if (!ran) {
		program.outputHelp()
		throw new Error('No command selected!')
	}
}

CLI().catch((err) => {
	console.error(chalk.red(err))
	process.exit(1)
})
