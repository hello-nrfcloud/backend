import { CloudFormationClient } from '@aws-sdk/client-cloudformation'
import { CloudWatchLogsClient } from '@aws-sdk/client-cloudwatch-logs'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { IoTClient } from '@aws-sdk/client-iot'
import { SSMClient } from '@aws-sdk/client-ssm'
import { STSClient } from '@aws-sdk/client-sts'
import { stackOutput } from '@nordicsemiconductor/cloudformation-helpers'
import chalk from 'chalk'
import { program } from 'commander'
import { env } from '../cdk/helpers/env.js'
import type { StackOutputs } from '../cdk/stacks/BackendStack.js'
import type { StackOutputs as MapBackendStackOutputs } from '../cdk/stacks/MapBackendStack.js'
import {
	MAP_BACKEND_STACK_NAME,
	STACK_NAME,
} from '../cdk/stacks/stackConfig.js'
import psjon from '../package.json'
import type { CommandDefinition } from './commands/CommandDefinition.js'
import { configureDeviceCommand } from './commands/configure-device.js'
import { createFakeNrfCloudAccountDeviceCredentials } from './commands/create-fake-nrfcloud-account-device-credentials.js'
import { createFakeNrfCloudHealthCheckDevice } from './commands/create-fake-nrfcloud-health-check-device.js'
import { createHealthCheckDevice } from './commands/create-health-check-device.js'
import { importDevicesCommand } from './commands/import-devices.js'
import { initializeNRFCloudAccountCommand } from './commands/initialize-nrfcloud-account.js'
import { logsCommand } from './commands/logs.js'
import { provisionDkCommand } from './commands/provision-dk.js'
import { registerDeviceCommand } from './commands/register-device.js'
import { registerSimulatorDeviceCommand } from './commands/register-simulator-device.js'
import { setShadowFetcherCommand } from './commands/set-shadow-fetcher.js'
import { showDeviceCommand } from './commands/show-device.js'
import { showFingerprintCommand } from './commands/show-fingerprint.js'
import { showNRFCloudAccount } from './commands/show-nrfcloud-account.js'
import { simulateDeviceCommand } from './commands/simulate-device.js'
import { cleanBackupCertificates } from './commands/clean-backup-certificates.js'
import { listnRFCloudAccountsCommand } from './commands/list-nrfcloud-accounts.js'
import { configureRFCloudAccountCommand } from './commands/configure-nrfcloud-account.js'
import { getNRFCloudBulkOpsStatus } from './commands/get-nrfcloud-bulkops-status.js'
import { importUnsupportedDevice } from './commands/import-unsupported-device.js'
import { listDevicesCommand } from './commands/list-devices.js'
import { configureCoAPHealthCheckCommand } from './commands/configure-coap-health-check.js'
import { ECRClient } from '@aws-sdk/client-ecr'
import { buildContainersCommand } from './commands/build-container.js'
import { registerCustomMapDevice } from './commands/register-custom-device.js'

const ssm = new SSMClient({})
const iot = new IoTClient({})
const db = new DynamoDBClient({})
const cf = new CloudFormationClient({})
const logs = new CloudWatchLogsClient({})
const sts = new STSClient({})
const ecr = new ECRClient({})

const accountEnv = await env({ sts })

const die = (err: Error, origin: any) => {
	console.error(`An unhandled exception occurred!`)
	console.error(`Exception origin: ${JSON.stringify(origin)}`)
	console.error(err)
	process.exit(1)
}

process.on('uncaughtException', die)
process.on('unhandledRejection', die)

console.error('')

const CLI = async ({ isCI }: { isCI: boolean }) => {
	program.name('./cli.sh')
	program.description(
		`hello.nrfcloud.com backend ${psjon.version} Command Line Interface`,
	)
	program.version(psjon.version)

	const commands: CommandDefinition[] = [
		configureRFCloudAccountCommand({ ssm }),
		setShadowFetcherCommand({ ssm }),
		logsCommand({ stackName: STACK_NAME, cf, logs }),
		cleanBackupCertificates({ ssm }),
		listnRFCloudAccountsCommand({ ssm, stackName: STACK_NAME }),
		configureCoAPHealthCheckCommand({
			ssm,
			stackName: STACK_NAME,
		}),
		buildContainersCommand({
			ecr,
			ssm,
		}),
	]

	if (isCI) {
		console.error('Running on CI...')
		commands.push(
			createFakeNrfCloudAccountDeviceCredentials({
				iot,
				ssm,
			}),
			createFakeNrfCloudHealthCheckDevice({
				iot,
				ssm,
			}),
		)
	} else {
		commands.push(
			initializeNRFCloudAccountCommand({
				ssm,
				iot,
				stackName: STACK_NAME,
			}),
		)
		commands.push(
			createHealthCheckDevice({
				ssm,
				stackName: STACK_NAME,
				env: accountEnv,
			}),
		)
		try {
			const [outputs, mapOutputs] = await Promise.all([
				stackOutput(cf)<StackOutputs>(STACK_NAME),
				stackOutput(cf)<MapBackendStackOutputs>(MAP_BACKEND_STACK_NAME),
			])
			commands.push(
				showDeviceCommand({
					ssm,
					stackName: STACK_NAME,
					db,
					devicesTableName: outputs.devicesTableName,
					devicesIndexName: outputs.devicesTableFingerprintIndexName,
				}),
				configureDeviceCommand({
					ssm,
					stackName: STACK_NAME,
					db,
					devicesTableName: outputs.devicesTableName,
					devicesIndexName: outputs.devicesTableFingerprintIndexName,
				}),
				registerDeviceCommand({
					db,
					devicesTableName: outputs.devicesTableName,
				}),
				registerSimulatorDeviceCommand({
					db,
					devicesTableName: outputs.devicesTableName,
					ssm,
					stackName: STACK_NAME,
					env: accountEnv,
				}),
				simulateDeviceCommand({
					ssm,
					stackName: STACK_NAME,
					db,
					devicesTableName: outputs.devicesTableName,
					env: accountEnv,
				}),
				importDevicesCommand({
					db,
					devicesTableName: outputs.devicesTableName,
					ssm,
					stackName: STACK_NAME,
				}),
				provisionDkCommand({
					db,
					devicesTableName: outputs.devicesTableName,
					ssm,
					stackName: STACK_NAME,
					env: accountEnv,
				}),
				showFingerprintCommand({
					db,
					devicesTableName: outputs.devicesTableName,
				}),
				showNRFCloudAccount({
					ssm,
					stackName: STACK_NAME,
				}),
				getNRFCloudBulkOpsStatus({
					ssm,
					stackName: STACK_NAME,
				}),
				importUnsupportedDevice({
					db,
					devicesTableName: outputs.devicesTableName,
				}),
				listDevicesCommand({
					ssm,
					stackName: STACK_NAME,
				}),
				registerCustomMapDevice({
					db,
					publicDevicesTableName: mapOutputs.publicDevicesTableName,
					ssm,
					env: accountEnv,
					stackName: STACK_NAME,
				}),
			)
		} catch (error) {
			console.warn(chalk.yellow('⚠️'), chalk.yellow((error as Error).message))
		}
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

CLI({
	isCI: process.env.CI === '1',
}).catch((err) => {
	console.error(chalk.red(err))
	process.exit(1)
})
