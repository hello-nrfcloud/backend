import type { SSMClient } from '@aws-sdk/client-ssm'
import { apiClient } from '../../nrfcloud/apiClient.js'
import { getAPISettings } from '../../nrfcloud/settings.js'
import type { CommandDefinition } from './CommandDefinition.js'
import { table } from 'table'

export const listDevicesCommand = ({
	ssm,
	stackName,
}: {
	ssm: SSMClient
	stackName: string
}): CommandDefinition => ({
	command: 'list-devices <account>',
	action: async (account) => {
		const { apiKey, apiEndpoint } = await getAPISettings({
			ssm,
			stackName,
			account,
		})()

		const client = apiClient({
			endpoint: apiEndpoint,
			apiKey,
		})

		// FIXME: client needs to implement pagination
		const maybeDevices = await client.listDevices()
		if ('error' in maybeDevices) {
			console.error(maybeDevices.error)
			process.exit(1)
		}

		console.log(maybeDevices.devices.total, 'devices')

		let i = 0
		const data = [
			['#', 'ID', 'Firmware version'],
			...maybeDevices.devices.items.map(({ id, firmware }) => [
				++i,
				id,
				firmware?.app?.version ?? '-',
			]),
		]

		console.log(
			table(data, {
				drawHorizontalLine: (lineIndex, rowCount) =>
					lineIndex === 0 || lineIndex === 1 || lineIndex === rowCount,
			}),
		)
	},
	help: 'List the devices registered in the account',
})
