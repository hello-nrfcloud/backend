import {
	ScanCommand,
	type DynamoDBClient,
	UpdateItemCommand,
	Select,
	ReturnValuesOnConditionCheckFailure,
} from '@aws-sdk/client-dynamodb'
import chalk from 'chalk'
import type { CommandDefinition } from '../../cli/commands/CommandDefinition.js'

import {
	DeleteParameterCommand,
	PutParameterCommand,
	type SSMClient,
} from '@aws-sdk/client-ssm'
import { Scope, getSettings, settingsPath } from '../../util/settings.js'

export const migrateNRFCloudAccounts = ({
	ssm,
	db,
	devicesTableName,
	stackName,
}: {
	ssm: SSMClient
	db: DynamoDBClient
	devicesTableName: string
	stackName: string
}): CommandDefinition => ({
	command: 'migrate-nrfcloud <fromAccount> <toAccount>',
	action: async (fromAccount, toAccount) => {
		// nRF Cloud Accounts
		console.log(chalk.green('Migrating account'))
		await Promise.allSettled([
			ssm.send(
				new DeleteParameterCommand({
					Name: settingsPath({
						stackName,
						scope: Scope.NRFCLOUD_ACCOUNT,
						property: fromAccount,
					}),
				}),
			),
			ssm.send(
				new PutParameterCommand({
					Name: settingsPath({
						stackName,
						scope: Scope.NRFCLOUD_ACCOUNT,
						property: toAccount,
					}),
					Value: toAccount,
					Type: 'String',
				}),
			),
		])

		// nRF Cloud settings
		const data = await getSettings({
			ssm,
			stackName,
			scope: `thirdParty/${fromAccount}`,
		})()

		await Promise.all(
			Object.entries(data).reduce<Promise<any>[]>((result, [key, value]) => {
				console.log(chalk.green('Migrating key'), chalk.blue(key))
				return [
					...result,
					ssm.send(
						new PutParameterCommand({
							Name: settingsPath({
								stackName,
								scope: `thirdParty/${toAccount}`,
								property: key,
							}),
							Value: value,
							Type: 'String',
						}),
					),
					ssm.send(
						new DeleteParameterCommand({
							Name: settingsPath({
								stackName,
								scope: `thirdParty/${fromAccount}`,
								property: key,
							}),
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
