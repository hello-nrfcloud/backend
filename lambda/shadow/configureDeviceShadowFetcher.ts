import { deviceShadowFetcher } from '../../nrfcloud/getDeviceShadowFromnRFCloud.js'
import { defaultApiEndpoint } from '../../nrfcloud/settings.js'
import { getNRFCloudSSMParameters } from '../util/getSSMParameter.js'

/**
 * Returns a ready to use instance of deviceShadowFetcher
 */
export const configureDeviceShadowFetcher =
	({ stackName }: { stackName: string }) =>
	async (): Promise<ReturnType<typeof deviceShadowFetcher>> => {
		const [apiKey, apiEndpoint] = await getNRFCloudSSMParameters(stackName, [
			'apiKey',
			'apiEndpoint',
		])
		if (apiKey === undefined)
			throw new Error(`nRF Cloud API key for ${stackName} is not configured.`)
		return deviceShadowFetcher({
			endpoint:
				apiEndpoint !== undefined ? new URL(apiEndpoint) : defaultApiEndpoint,
			apiKey,
		})
	}
