import type { SSMClient } from '@aws-sdk/client-ssm'
import {
	getSettings as getSSMSettings,
	putSettings,
	settingsPath,
} from '../util/settings.js'

export type Settings = {
	imageTag: string
	repositoryUri: string
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
		const { imageTag, repositoryUri } = p
		if (imageTag === undefined) throw new Error(`No image tag configured!`)
		if (repositoryUri === undefined)
			throw new Error(`No repository uri configured!`)

		return {
			imageTag,
			repositoryUri,
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
