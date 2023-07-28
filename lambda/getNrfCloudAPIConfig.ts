import { getNRFCloudSSMParameters } from './util/getSSMParameter.js'
import { once } from 'lodash-es'

export const getNrfCloudAPIConfig: (stackName: string) => Promise<{
	apiKey: string
	apiEndpoint: URL
}> = once(async (stackName) => {
	const [apiKey, apiEndpoint] = await getNRFCloudSSMParameters(stackName, [
		'apiKey',
		'apiEndpoint',
	])
	if (apiKey === undefined)
		throw new Error(`nRF Cloud API key for ${stackName} is not configured.`)

	return {
		apiKey,
		apiEndpoint: new URL(apiEndpoint ?? 'https://api.nrfcloud.com/'),
	}
})
