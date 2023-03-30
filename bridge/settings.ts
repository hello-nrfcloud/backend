import type { SSMClient } from '@aws-sdk/client-ssm'
import {
	getSettings as getSSMSettings,
	putSettings,
	settingsPath,
} from '../util/settings.js'

export type Settings = {
	repositoryName: string
	bridgeVersion: string
}

const scope = 'context'
const system = 'stack'

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
		scope,
		system,
	})
	return async (): Promise<Settings> => {
		const p = await settingsReader()
		const { bridgeVersion, repositoryName } = p
		if (bridgeVersion === undefined)
			throw new Error(`No bridge version configured!`)
		if (repositoryName === undefined)
			throw new Error(`No repository name configured!`)

		return {
			bridgeVersion,
			repositoryName,
		}
	}
}

export const updateSettings = ({
	ssm,
	stackName,
}: {
	ssm: SSMClient
	stackName: string
}): ((settings: Settings) => Promise<void>) => {
	const settingsWriter = putSettings({
		ssm,
		stackName,
		scope,
		system,
	})
	return async (settings: Settings): Promise<void> => {
		await Promise.all(
			Object.entries(settings).map(async ([k, v]) =>
				settingsWriter({
					property: k,
					value: v,
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
		stackName: stackName,
		scope,
		system,
		property: parameterName,
	})
