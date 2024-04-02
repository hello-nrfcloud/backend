import type { SSMClient } from '@aws-sdk/client-ssm'
import {
	Scope,
	deleteSettings,
	getSettings,
	putSettings,
} from '../settings/settings.js'

export type Settings = {
	simulatorDownloadURL: URL
}
export const getCoAPHealthCheckSettings = async ({
	ssm,
	stackName,
}: {
	ssm: SSMClient
	stackName: string
}): Promise<Settings> => ({
	simulatorDownloadURL: new URL(
		(
			await getSettings<{
				simulatorDownloadURL: string
			}>({ ssm, stackName, scope: Scope.STACK_COAP_HEALTH_CHECK })()
		).simulatorDownloadURL,
	),
})

export const setCoAPHealthCheckSettings =
	({ ssm, stackName }: { ssm: SSMClient; stackName: string }) =>
	async (
		property: keyof Settings,
		value: URL,
		/**
		 * Useful when depending on the parameter having version 1, e.g. for use in CloudFormation
		 */
		deleteBeforeUpdate?: boolean,
	): Promise<{ name: string }> =>
		putSettings({ ssm, stackName, scope: Scope.STACK_COAP_HEALTH_CHECK })({
			property,
			value: value.toString(),
			deleteBeforeUpdate,
		})

export const deleteCoAPHealthCheckSettings =
	({ ssm, stackName }: { ssm: SSMClient; stackName: string }) =>
	async (property: keyof Settings): Promise<{ name: string }> =>
		deleteSettings({ ssm, stackName, scope: Scope.STACK_COAP_HEALTH_CHECK })({
			property,
		})
