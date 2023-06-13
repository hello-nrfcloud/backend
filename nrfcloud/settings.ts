import type { SSMClient } from '@aws-sdk/client-ssm'
import {
	getSettings as getSSMSettings,
	putSettings,
	settingsPath,
} from '../util/settings.js'

export const defaultApiEndpoint = new URL('https://api.nrfcloud.com')

export type Settings = {
	apiEndpoint: URL
	apiKey: string
	serviceKey: string
	teamId: string
	accountDeviceClientCert: string
	accountDevicePrivateKey: string
	accountDeviceClientId: string
	mqttEndpoint: string
	mqttTopicPrefix: string
}

export const getSettings = ({
	ssm,
	stackName,
}: {
	ssm: SSMClient
	stackName: string
}): (() => Promise<Settings>) => {
	const settingsReader = getSSMSettings({
		ssm,
		stackName,
		scope: 'thirdParty',
		system: 'nrfcloud',
	})
	return async (): Promise<Settings> => {
		const p = await settingsReader()
		const {
			apiEndpoint,
			apiKey,
			accountDeviceClientCert,
			accountDevicePrivateKey,
			mqttEndpoint,
			accountDeviceClientId,
			mqttTopicPrefix,
			serviceKey,
			teamId,
		} = p
		if (apiKey === undefined)
			throw new Error(`No nRF Cloud API key configured!`)
		if (serviceKey === undefined)
			throw new Error(`No nRF Cloud ground fix service key configured!`)
		if (teamId === undefined)
			throw new Error(`No nRF Cloud team id configured!`)
		if (accountDeviceClientCert === undefined)
			throw new Error(`No nRF Cloud account device clientCert configured!`)
		if (accountDevicePrivateKey === undefined)
			throw new Error(`No nRF Cloud account device privateKey configured!`)
		if (accountDeviceClientId === undefined)
			throw new Error(`No nRF Cloud Account Device client ID configured!`)
		if (mqttTopicPrefix === undefined)
			throw new Error(`No nRF Cloud MQTT topic prefix configured!`)
		if (mqttEndpoint === undefined)
			throw new Error(`No nRF Cloud MQTT endpoint configured!`)

		return {
			apiEndpoint:
				apiEndpoint === undefined ? defaultApiEndpoint : new URL(apiEndpoint),
			apiKey,
			mqttEndpoint,
			accountDeviceClientCert,
			accountDevicePrivateKey,
			accountDeviceClientId,
			mqttTopicPrefix,
			serviceKey,
			teamId,
		}
	}
}

export const getAPISettings = ({
	ssm,
	stackName,
}: {
	ssm: SSMClient
	stackName: string
}): (() => Promise<Pick<Settings, 'apiKey' | 'apiEndpoint'>>) => {
	const settingsReader = getSSMSettings({
		ssm,
		stackName,
		scope: 'thirdParty',
		system: 'nrfcloud',
	})
	return async (): Promise<Pick<Settings, 'apiKey' | 'apiEndpoint'>> => {
		const p = await settingsReader()
		const { apiEndpoint, apiKey } = p
		if (apiKey === undefined)
			throw new Error(`No nRF Cloud API key configured!`)

		return {
			apiEndpoint:
				apiEndpoint === undefined ? defaultApiEndpoint : new URL(apiEndpoint),
			apiKey,
		}
	}
}

export const updateSettings = ({
	ssm,
	stackName,
}: {
	ssm: SSMClient
	stackName: string
}): ((settings: Partial<Settings>) => Promise<void>) => {
	const settingsWriter = putSettings({
		ssm,
		stackName,
		scope: 'thirdParty',
		system: 'nrfcloud',
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

export const parameterName = (
	stackName: string,
	parameterName: keyof Settings,
): string =>
	settingsPath({
		stackName,
		scope: 'thirdParty',
		system: 'nrfcloud',
		property: parameterName,
	})
