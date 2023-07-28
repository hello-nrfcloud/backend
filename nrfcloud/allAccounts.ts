import { SSMClient } from '@aws-sdk/client-ssm'
import { Scope } from '../util/settings.js'
import { type Settings } from './settings.js'
import {
	type Settings as HealthCheckSettings,
	getSettings as getHealthCheckSettings,
} from './healthCheckSettings.js'
import { getSettings } from '../util/settings.js'
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
}): Promise<string[]> =>
	Object.keys(
		await getSettings({
			ssm,
			stackName,
			scope: Scope.NRFCLOUD_ACCOUNT,
		})(),
	)

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
					nrfCloudSettings: await nRFCloudSettings({ ssm, stackName, account }),
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

const nRFCloudSettings = async ({
	ssm,
	stackName,
	account,
}: {
	ssm: SSMClient
	stackName: string
	account: string
}): Promise<Settings> => {
	return await getnRFCloudSettings({ ssm, stackName, account })()
}
