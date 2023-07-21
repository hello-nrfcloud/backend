import type { SSMClient } from '@aws-sdk/client-ssm'
import { Scope } from '../util/settings.js'
import { type Settings, getSettings } from './settings.js'
import {
	type Settings as HealthCheckSettings,
	getSettings as getHealthCheckSettings,
} from './healthCheckSettings.js'

export const allAccountScopes = [
	Scope.EXEGER_CONFIG,
	Scope.NODIC_CONFIG,
] as const

export type AllNRFCloudSettings = {
	nrfCloudSettings: Settings
	healthCheckSettings: HealthCheckSettings
}

export const getAllAccountsSettings =
	({ ssm, stackName }: { ssm: SSMClient; stackName: string }) =>
	async (): Promise<
		Record<string, AllNRFCloudSettings | Record<string, never>>
	> =>
		allAccountScopes.reduce(async (resultPromise, scope) => {
			const result = await resultPromise
			const account = scope.toString().replace(/([^/]+\/)/, '')
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

const healthCheckSettings = async ({
	ssm,
	stackName,
	scope,
}: {
	ssm: SSMClient
	stackName: string
	scope: (typeof allAccountScopes)[number]
}): Promise<HealthCheckSettings | Record<string, never>> => {
	try {
		return getHealthCheckSettings({ ssm, stackName, scope })()
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
	scope: (typeof allAccountScopes)[number]
}): Promise<Settings | Record<string, never>> => {
	try {
		return getSettings({ ssm, stackName, scope })()
	} catch {
		return {}
	}
}
