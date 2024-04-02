import { SSMClient } from '@aws-sdk/client-ssm'
import { Scope } from '../settings/settings.js'
import { type Settings } from './settings.js'
import {
	type Settings as HealthCheckSettings,
	getSettings as getHealthCheckSettings,
} from './healthCheckSettings.js'
import { getSettings } from '../settings/settings.js'
import { getSettings as getnRFCloudSettings } from './settings.js'

export type AllNRFCloudSettings = {
	nrfCloudSettings: Settings
	healthCheckSettings: HealthCheckSettings
}

export const getAllnRFCloudAccounts = async ({
	ssm,
	stackName,
}: {
	ssm: SSMClient
	stackName: string
}): Promise<string[]> => [
	...new Set(
		Object.keys(
			await getSettings({
				ssm,
				stackName,
				scope: Scope.NRFCLOUD_ACCOUNT_PREFIX,
			})(),
		).map((key) => key.split('/')[0] as string),
	),
]

export const getAllAccountsSettings =
	({ ssm, stackName }: { ssm: SSMClient; stackName: string }) =>
	async (): Promise<Record<string, AllNRFCloudSettings>> => {
		const allAccounts = await getAllnRFCloudAccounts({ ssm, stackName })
		return allAccounts.reduce(async (resultPromise, account) => {
			const result = await resultPromise
			return {
				...result,
				[account]: {
					healthCheckSettings: await healthCheckSettings({
						ssm,
						stackName,
						account,
					}),
					nrfCloudSettings: await getnRFCloudSettings({
						ssm,
						stackName,
						account,
					})(),
				},
			}
		}, Promise.resolve({}))
	}

const healthCheckSettings = async ({
	ssm,
	stackName,
	account,
}: {
	ssm: SSMClient
	stackName: string
	account: string
}): Promise<HealthCheckSettings> => {
	return await getHealthCheckSettings({ ssm, stackName, account })()
}
