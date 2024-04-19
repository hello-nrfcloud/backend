import type { SSMClient } from '@aws-sdk/client-ssm'
import { ScopeContexts } from './scope.js'
import { remove, get, put } from '@bifravst/aws-ssm-settings-helpers'

export type Settings = {
	webhookURL: URL
}
export const getFeedbackSettings = async ({
	ssm,
	stackName,
}: {
	ssm: SSMClient
	stackName: string
}): Promise<Settings> => ({
	webhookURL: new URL(
		(
			await get(ssm)<{
				webhookURL: string
			}>({ stackName, ...ScopeContexts.STACK_FEEDBACK })()
		).webhookURL,
	),
})

export const setFeedbackSettings =
	({ ssm, stackName }: { ssm: SSMClient; stackName: string }) =>
	async (
		property: keyof Settings,
		value: URL,
		/**
		 * Useful when depending on the parameter having version 1, e.g. for use in CloudFormation
		 */
		deleteBeforeUpdate?: boolean,
	): Promise<{ name: string }> =>
		put(ssm)({ stackName, ...ScopeContexts.STACK_FEEDBACK })({
			property,
			value: value.toString(),
			deleteBeforeUpdate,
		})

export const deleteFeedbackSettings =
	({ ssm, stackName }: { ssm: SSMClient; stackName: string }) =>
	async (property: keyof Settings): Promise<{ name: string }> =>
		remove(ssm)({
			stackName,
			...ScopeContexts.STACK_FEEDBACK,
		})({
			property,
		})
