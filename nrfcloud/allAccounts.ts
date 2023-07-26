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
	async (): Promise<
		Record<string, AllNRFCloudSettings | Record<string, never>>
	> => {
		const allAccounts = await getAllnRFCloudAccounts({ ssm, stackName })
		return allAccounts.reduce(async (resultPromise, account) => {
			const result = await resultPromise
			const scope = `thirdParty/${account}`
			return {
				...result,
				[account]: {
					healthCheckSettings: await healthCheckSettings({
						ssm,
						stackName,
						scope,
					}),
					nrfCloudSettings: await nRFCloudSettings({ ssm, stackName, scope }),
				},
			}
		}, Promise.resolve({}))
	}

const healthCheckSettings = async ({
	ssm,
	stackName,
	scope,
}: {
	ssm: SSMClient
	stackName: string
	scope: string
}): Promise<HealthCheckSettings | Record<string, never>> => {
	try {
		return await getHealthCheckSettings({ ssm, stackName, scope })()
	} catch {
		return {}
	}
}

const nRFCloudSettings = async ({
	ssm,
	stackName,
	scope,
}: {
	ssm: SSMClient
	stackName: string
	scope: string
}): Promise<Settings | Record<string, never>> => {
	try {
		return await getnRFCloudSettings({ ssm, stackName, scope })()
	} catch {
		return {}
	}
}
