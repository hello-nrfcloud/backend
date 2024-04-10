import type { SSMClient } from '@aws-sdk/client-ssm'
import { get, put } from '@bifravst/aws-ssm-settings-helpers'
import {
	NRFCLOUD_ACCOUNT_SCOPE,
	groupByAccount,
	nrfCloudAccount,
} from '@hello.nrfcloud.com/nrfcloud-api-helpers/settings'

export type Settings = {
	healthCheckClientCert: string
	healthCheckPrivateKey: string
	healthCheckClientId: string
	healthCheckModel: string
	healthCheckFingerPrint: string
}

export const updateSettings = ({
	ssm,
	stackName,
	account,
}: {
	ssm: SSMClient
	stackName: string
	account: string
}): ((settings: Partial<Settings>) => Promise<void>) => {
	const settingsWriter = put(ssm)({
		stackName,
		scope: NRFCLOUD_ACCOUNT_SCOPE,
		context: nrfCloudAccount(account),
	})
	return async (settings): Promise<void> => {
		await Promise.all(
			Object.entries(settings).map(async ([k, v]) =>
				settingsWriter({
					property: k,
					value: v.toString(),
				}),
			),
		)
	}
}

const validateSettings = (p: Record<string, string>): Settings => {
	const {
		healthCheckClientCert,
		healthCheckPrivateKey,
		healthCheckClientId,
		healthCheckModel,
		healthCheckFingerPrint,
	} = p
	if (healthCheckClientCert === undefined)
		throw new Error(`No health check client certificate configured`)
	if (healthCheckPrivateKey === undefined)
		throw new Error(`No health check client private key configured`)
	if (healthCheckClientId === undefined)
		throw new Error(`No health check client id configured`)
	if (healthCheckModel === undefined)
		throw new Error(`No health check device model configured`)
	if (healthCheckFingerPrint === undefined)
		throw new Error(`No health check device fingerprint configured`)

	return {
		healthCheckClientCert,
		healthCheckPrivateKey,
		healthCheckClientId,
		healthCheckModel,
		healthCheckFingerPrint,
	}
}

export const getAllAccountsSettings = async ({
	ssm,
	stackName,
}: {
	ssm: SSMClient
	stackName: string
}): Promise<Record<string, Settings>> =>
	Object.entries(
		groupByAccount(
			await get(ssm)({
				stackName,
				scope: NRFCLOUD_ACCOUNT_SCOPE,
			})(),
		),
	).reduce(
		(allSettings, [account, settings]) => ({
			...allSettings,
			[account]: validateSettings(settings),
		}),
		{},
	)
