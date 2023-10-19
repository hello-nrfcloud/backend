import type { SSMClient } from '@aws-sdk/client-ssm'
import {
	Scope,
	getSettings as getSSMSettings,
	putSettings,
} from '../util/settings.js'

export type Settings = {
	healthCheckClientCert: string
	healthCheckPrivateKey: string
	healthCheckClientId: string
	healthCheckModel: string
	healthCheckFingerPrint: string
	healthCheckPublicKey?: string
	healthCheckPkcs8PrivateKey?: string
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
	const settingsWriter = putSettings({
		ssm,
		stackName,
		scope: `${Scope.NRFCLOUD_ACCOUNT_PREFIX}/${account}`,
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
	const scope = `${Scope.NRFCLOUD_ACCOUNT_PREFIX}/${account}`
	const settingsReader = getSSMSettings({
		ssm,
		stackName,
		scope,
	})
	return async (): Promise<Settings> => {
		const p = await settingsReader()
		const {
			healthCheckClientCert,
			healthCheckPrivateKey,
			healthCheckClientId,
			healthCheckModel,
			healthCheckFingerPrint,
			healthCheckPublicKey,
			healthCheckPkcs8PrivateKey,
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
			healthCheckPublicKey,
			healthCheckPkcs8PrivateKey,
		}
	}
}
