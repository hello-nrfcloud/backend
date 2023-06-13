import { CloudFormationClient } from '@aws-sdk/client-cloudformation'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { IoTClient } from '@aws-sdk/client-iot'
import { SSMClient } from '@aws-sdk/client-ssm'
import { stackOutput } from '@nordicsemiconductor/cloudformation-helpers'
import chalk from 'chalk'
import { program } from 'commander'
import type { StackOutputs } from '../cdk/stacks/BackendStack.js'
import { STACK_NAME } from '../cdk/stacks/stackConfig.js'
import psjon from '../package.json'
import type { CommandDefinition } from './commands/CommandDefinition'
import { configureCommand } from './commands/configure.js'
import { createFakeNrfCloudAccountDeviceCredentials } from './commands/createFakeNrfCloudAccountDeviceCredentials.js'
import { initializeNRFCloudAccountCommand } from './commands/initialize-nrfcloud-account.js'
import { listNRFCloudDevicesCommand } from './commands/list-nrfcloud-devices.js'
import { registerDeviceCommand } from './commands/register-device.js'

const ssm = new SSMClient({})
const iot = new IoTClient({})
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

const muninnBackendCLI = async ({ isCI }: { isCI: boolean }) => {
	program.name('./cli.sh')
	program.description(`Muninn backend ${psjon.version} Command Line Interface`)
	program.version(psjon.version)

	const commands: CommandDefinition[] = [configureCommand({ ssm })]

	if (isCI) {
		console.error('Running on CI...')
		commands.push(
			createFakeNrfCloudAccountDeviceCredentials({
				iot,
				ssm,
			}),
		)
	} else {
		const outputs = await stackOutput(
			new CloudFormationClient({}),
		)<StackOutputs>(STACK_NAME)
		commands.push(
			initializeNRFCloudAccountCommand({
				ssm,
				iot,
				stackName: STACK_NAME,
			}),
			listNRFCloudDevicesCommand({
				ssm,
				stackName: STACK_NAME,
				db,
				devicesTableName: outputs.devicesTable,
			}),
			registerDeviceCommand({
				db,
				devicesTableName: outputs.devicesTable,
			}),
		)
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

muninnBackendCLI({
	isCI: process.env.CI === '1',
}).catch((err) => {
	console.error(chalk.red(err))
	process.exit(1)
})
