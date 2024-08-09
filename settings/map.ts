import type { SSMClient } from '@aws-sdk/client-ssm'
import {
	ContextNotConfiguredError,
	get,
	put,
	remove,
} from '@bifravst/aws-ssm-settings-helpers'
import { ScopeContexts } from './scope.js'

export type Settings = {
	apiEndpoint: URL
}
export const getMapSettings = async ({
	ssm,
	stackName,
}: {
	ssm: SSMClient
	stackName: string
}): Promise<Settings> => {
	let apiEndpoint = new URL('https://api.nordicsemi.world/')
	try {
		const r = await get(ssm)<{
			apiEndpoint?: string
		}>({ stackName, ...ScopeContexts.STACK_MAP })()
		if (r.apiEndpoint !== undefined) apiEndpoint = new URL(r.apiEndpoint)
	} catch (error) {
		if (!(error instanceof ContextNotConfiguredError)) throw error
	}
	return {
		apiEndpoint,
	}
}

export const setMapSettings =
	({ ssm, stackName }: { ssm: SSMClient; stackName: string }) =>
	async (
		property: keyof Settings,
		value: string | URL,
		/**
		 * Useful when depending on the parameter having version 1, e.g. for use in CloudFormation
		 */
		deleteBeforeUpdate?: boolean,
	): Promise<{ name: string }> =>
		put(ssm)({ stackName, ...ScopeContexts.STACK_MAP })({
			property,
			value: value.toString(),
			deleteBeforeUpdate,
		})

export const deleteMapSettings =
	({ ssm, stackName }: { ssm: SSMClient; stackName: string }) =>
	async (property: keyof Settings): Promise<{ name: string }> =>
		remove(ssm)({
			stackName,
			...ScopeContexts.STACK_MAP,
		})({
			property,
		})
