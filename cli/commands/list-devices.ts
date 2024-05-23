import type { SSMClient } from '@aws-sdk/client-ssm'
import { devices as devicesApi } from '@hello.nrfcloud.com/nrfcloud-api-helpers/api'
import { getAPISettings } from '@hello.nrfcloud.com/nrfcloud-api-helpers/settings'
import type { CommandDefinition } from './CommandDefinition.js'
import { table } from 'table'
import { lastSeenRepo } from '../../lastSeen/lastSeenRepo.js'
import type { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { isNullOrUndefined } from '../../util/isNullOrUndefined.js'

const ago = (d: Date) =>
	Math.floor((Date.now() - d.getTime()) / 1000 / 60 / 60 / 24)

export const listDevicesCommand = ({
	ssm,
	stackName,
	db,
	lastSeenTableName,
}: {
	ssm: SSMClient
	stackName: string
	db: DynamoDBClient
	lastSeenTableName: string
}): CommandDefinition => {
	const getLastSeen = lastSeenRepo(db, lastSeenTableName)
	return {
		command: 'list-devices <account>',
		options: [
			{
				flags: '-l, --last-seen',
				description: `Show the time when the device was last seen`,
			},
		],
		action: async (account, { lastSeen }) => {
			const { apiKey, apiEndpoint } = await getAPISettings({
				ssm,
				stackName,
				account,
			})()

			const client = devicesApi({
				endpoint: apiEndpoint,
				apiKey,
			})

			// FIXME: client needs to implement pagination
			const maybeDevices = await client.list()
			if ('error' in maybeDevices) {
				console.error(maybeDevices.error)
				process.exit(1)
			}

			const devices = maybeDevices.result

			console.log(devices.total, 'devices')

			const deviceLastSeen =
				lastSeen === true
					? await getLastSeen.getLastSeenBatch(
							devices.items.map(({ id }) => id),
						)
					: {}

			let i = 0
			const header = ['#', 'ID', 'Firmware version']
			if (lastSeen === true) header.push('Last seen')
			const data = [
				header,
				...(await Promise.all(
					devices.items.map(async ({ id }) => {
						const data = [++i, id]
						if (lastSeen === true) {
							const lastSeen = deviceLastSeen[id]
							if (isNullOrUndefined(lastSeen)) {
								data.push('-')
							} else {
								data.push(`${ago(lastSeen)} days go`)
							}
						}
						return data
					}),
				)),
			]

			console.log(
				table(data, {
					drawHorizontalLine: (lineIndex, rowCount) =>
						lineIndex === 0 || lineIndex === 1 || lineIndex === rowCount,
				}),
			)
		},
		help: 'List the devices registered in the account',
	}
}
