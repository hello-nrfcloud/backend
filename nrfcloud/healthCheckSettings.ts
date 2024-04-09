import type { SSMClient } from '@aws-sdk/client-ssm'
import { nrfCloudAccount } from '../settings/scope.js'
import { get, put } from '@bifravst/aws-ssm-settings-helpers'

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
		...nrfCloudAccount(account),
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

export const getSettings = ({
	ssm,
	stackName,
	account,
}: {
	ssm: SSMClient
	stackName: string
	account: string
}): (() => Promise<Settings>) => {
	const settingsReader = get(ssm)({
		stackName,
		...nrfCloudAccount(account),
	})
	return async (): Promise<Settings> => {
		const p = await settingsReader()
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
}
