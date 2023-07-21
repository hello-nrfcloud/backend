import {
	ScanCommand,
	type DynamoDBClient,
	UpdateItemCommand,
	Select,
	ReturnValuesOnConditionCheckFailure,
} from '@aws-sdk/client-dynamodb'
import chalk from 'chalk'
import type { CommandDefinition } from './CommandDefinition.js'
import {
	availableAccounts,
	convertTonRFAccount,
	validnRFCloudAccount,
} from '../validnRFCloudAccount.js'
import {
	DeleteParameterCommand,
	GetParametersByPathCommand,
	PutParameterCommand,
	type SSMClient,
} from '@aws-sdk/client-ssm'
import { STACK_NAME } from '../../cdk/stacks/stackConfig.js'

export const migrateNRFCloudAccounts = ({
	ssm,
	db,
	devicesTableName,
}: {
	ssm: SSMClient
	db: DynamoDBClient
	devicesTableName: string
}): CommandDefinition => ({
	command: 'migrate-nrfcloud <fromAccount> <toAccount>',
	action: async (fromAccount, toAccount) => {
		if (!(fromAccount === 'nrfcloud' || toAccount === 'nrfcloud')) {
			console.error(
				chalk.red('⚠️'),
				'',
				chalk.red(`either fromAccount or toAccount must be nrfcloud`),
			)
			process.exit(1)
		}

		if (fromAccount === 'nrfcloud') {
			const scope = convertTonRFAccount(toAccount)
			if (!validnRFCloudAccount(scope)) {
				console.error(
					chalk.red('⚠️'),
					'',
					chalk.red(`account should be ${availableAccounts.join(', ')}`),
				)
				process.exit(1)
			}
		}

		if (toAccount === 'nrfcloud') {
			const scope = convertTonRFAccount(fromAccount)
			if (!validnRFCloudAccount(scope)) {
				console.error(
					chalk.red('⚠️'),
					'',
					chalk.red(`account should be ${availableAccounts.join(', ')}`),
				)
				process.exit(1)
			}
		}

		const parameters = await ssm.send(
			new GetParametersByPathCommand({
				Path: `/${STACK_NAME}/thirdParty/${fromAccount}`,
				Recursive: true,
			}),
		)

		const data = [
			...(parameters.Parameters?.map((p) => ({
				Name: p.Name,
				Value: p.Value,
			})) ?? []),
		]

		await Promise.all(
			data.reduce<Promise<any>[]>((result, p) => {
				const key = p.Name?.split('/').reverse()[0]
				console.log(chalk.green('Migrating key'), chalk.blue(key))
				return [
					...result,
					ssm.send(
						new PutParameterCommand({
							Name: `/${STACK_NAME}/thirdParty/${toAccount}/${key}`,
							Value: p.Value,
							Type: 'String',
						}),
					),
					ssm.send(
						new DeleteParameterCommand({
							Name: p.Name,
						}),
					),
				]
			}, []),
		)

		// Update devices table
		const { Items: devices } = await db.send(
			new ScanCommand({
				TableName: devicesTableName,
				Select: Select.SPECIFIC_ATTRIBUTES,
				ProjectionExpression: 'deviceId',
			}),
		)
		console.log(
			chalk.green('Migrating devices table'),
			chalk.blue(devices?.length ?? 0),
			chalk.green('device(s)'),
		)
		await Promise.allSettled(
			(devices ?? []).map(async (device) =>
				db.send(
					new UpdateItemCommand({
						TableName: devicesTableName,
						Key: { deviceId: { S: device.deviceId?.S ?? '' } },
						UpdateExpression: `SET #account = :toAccount`,
						ConditionExpression: `attribute_not_exists(#account) OR #account = :fromAccount OR #account = :emptyString`,
						ExpressionAttributeNames: {
							'#account': 'account',
						},
						ExpressionAttributeValues: {
							':toAccount': { S: toAccount },
							':fromAccount': { S: fromAccount },
							':emptyString': { S: '' },
						},
						ReturnValuesOnConditionCheckFailure:
							ReturnValuesOnConditionCheckFailure.ALL_OLD,
					}),
				),
			),
		)
	},
	help: 'Migrate nRF Cloud account',
})
