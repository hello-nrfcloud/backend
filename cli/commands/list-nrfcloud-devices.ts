import {
	BatchGetItemCommand,
	type DynamoDBClient,
} from '@aws-sdk/client-dynamodb'
import { SSMClient } from '@aws-sdk/client-ssm'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import { table } from 'table'
import { apiClient } from '../../nrfcloud/apiClient.js'
import { getAPISettings } from '../../nrfcloud/settings.js'
import type { CommandDefinition } from './CommandDefinition.js'

export const listNRFCloudDevicesCommand = ({
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
	command: 'list-devices',
	options: [
		{
			flags: '-p, --paginationToken <paginationToken>',
			description: `Pagination token used to access the next page in the result set`,
		},
	],
	action: async () => {
		const { apiKey, apiEndpoint } = await getAPISettings({
			ssm,
			stackName,
		})()

		const client = apiClient({
			endpoint: apiEndpoint,
			apiKey,
		})

		const devices = await client.listDevices()
		if ('error' in devices) {
			console.error(devices.error)
			throw new Error(`Failed to list devices`)
		}

		const { items, total } = devices.devices

		const { Responses } = await db.send(
			new BatchGetItemCommand({
				RequestItems: {
					[devicesTableName]: {
						Keys: items.map(({ id }) => ({
							deviceId: { S: id },
						})),
						ProjectionExpression: 'deviceId,fingerprint,model',
					},
				},
			}),
		)

		const deviceInfos =
			Responses?.[devicesTableName]?.map((item) => unmarshall(item)) ?? []

		console.log(
			table(
				[
					['ID', 'Fingerprint', 'Model'],
					...items.map(({ id }) => {
						const deviceInfo = deviceInfos.find(
							({ deviceId }) => deviceId === id,
						)

						if (deviceInfo !== undefined)
							return [id, deviceInfo.fingerprint, deviceInfo.model]

						return [id, '-', '-']
					}),
					[`Total: ${total}`, '', ''],
				],
				{
					drawHorizontalLine: (lineIndex, rowCount) => {
						return (
							lineIndex === 0 ||
							lineIndex === 1 ||
							lineIndex === rowCount - 1 ||
							lineIndex === rowCount
						)
					},
				},
			),
		)
	},
	help: 'List registered devices',
})
