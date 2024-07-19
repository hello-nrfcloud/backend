import type { SSMClient } from '@aws-sdk/client-ssm'
import { ScopeContexts } from './scope.js'
import { remove, get, put } from '@bifravst/aws-ssm-settings-helpers'

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
	const r = await get(ssm)<{
		apiEndpoint?: string
	}>({ stackName, ...ScopeContexts.STACK_MAP })()
	const { apiEndpoint } = r
	return {
		apiEndpoint: new URL(apiEndpoint ?? `https://api.nordicsemi.world/`),
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
