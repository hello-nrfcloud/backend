import type { SSMClient } from '@aws-sdk/client-ssm'
import { ScopeContexts } from './scope.js'
import { remove, get, put } from '@bifravst/aws-ssm-settings-helpers'

export type Settings = {
	organizationAuthToken: string
	organizationSlug: string
	projectSlug: string
	apiEndpoint: URL
}
export const getMemfaultSettings = async ({
	ssm,
	stackName,
}: {
	ssm: SSMClient
	stackName: string
}): Promise<Settings> => {
	const r = await get(ssm)<{
		organizationAuthToken: string
		organizationSlug: string
		projectSlug: string
		apiEndpoint?: string
	}>({ stackName, ...ScopeContexts.STACK_MEMFAULT })()
	const { organizationAuthToken, organizationSlug, projectSlug, apiEndpoint } =
		r
	if (organizationAuthToken === undefined)
		throw new Error(`Memfault organizationAuthToken is not configured.`)
	if (organizationSlug === undefined)
		throw new Error(`Memfault organizationSlug is not configured.`)
	if (projectSlug === undefined)
		throw new Error(`Memfault projectSlug is not configured.`)
	return {
		organizationAuthToken,
		organizationSlug,
		projectSlug,
		apiEndpoint: new URL(apiEndpoint ?? `https://api.memfault.com/`),
	}
}

export const setMemfaultSettings =
	({ ssm, stackName }: { ssm: SSMClient; stackName: string }) =>
	async (
		property: keyof Settings,
		value: string | URL,
		/**
		 * Useful when depending on the parameter having version 1, e.g. for use in CloudFormation
		 */
		deleteBeforeUpdate?: boolean,
	): Promise<{ name: string }> =>
		put(ssm)({ stackName, ...ScopeContexts.STACK_MEMFAULT })({
			property,
			value: value.toString(),
			deleteBeforeUpdate,
		})

export const deleteMemfaultSettings =
	({ ssm, stackName }: { ssm: SSMClient; stackName: string }) =>
	async (property: keyof Settings): Promise<{ name: string }> =>
		remove(ssm)({
			stackName,
			...ScopeContexts.STACK_MEMFAULT,
		})({
			property,
		})
