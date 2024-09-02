import { SSMClient } from '@aws-sdk/client-ssm'
import { fromEnv } from '@bifravst/from-env'
import { logger } from '@hello.nrfcloud.com/lambda-helpers/logger'
import { metricsForComponent } from '@hello.nrfcloud.com/lambda-helpers/metrics'
import { requestLogger } from '@hello.nrfcloud.com/lambda-helpers/requestLogger'
import { createFOTAJob } from '@hello.nrfcloud.com/nrfcloud-api-helpers/api'
import middy from '@middy/core'
import { loggingFetch } from '../../../util/loggingFetch.js'
import { getAllNRFCloudAPIConfigs } from '../../nrfcloud/getAllNRFCloudAPIConfigs.js'

const { stackName } = fromEnv({
	stackName: 'STACK_NAME',
})(process.env)

const ssm = new SSMClient({})

const allNRFCloudAPIConfigs = getAllNRFCloudAPIConfigs({ ssm, stackName })()

const { track } = metricsForComponent('deviceFOTA')
const trackFetch = loggingFetch({ track, log: logger('deviceFOTA') })

const h = async (event: {
	account: string
	deviceId: string
	bundleId: string
	reportedVersion: string
}): Promise<{
	jobId: string
}> => {
	const { apiKey, apiEndpoint } =
		(await allNRFCloudAPIConfigs)[event.account] ?? {}
	if (apiKey === undefined || apiEndpoint === undefined)
		throw new Error(`nRF Cloud API key for ${event.account} is not configured.`)

	const createJob = createFOTAJob(
		{
			endpoint: apiEndpoint,
			apiKey,
		},
		trackFetch,
	)

	const res = await createJob({
		deviceId: event.deviceId,
		bundleId: event.bundleId,
	})

	if (!('result' in res)) {
		throw new Error(`Failed to create job: ${res.error.message}.`)
	}

	return {
		jobId: res.result.jobId,
	}
}

export const handler = middy().use(requestLogger()).handler(h)
