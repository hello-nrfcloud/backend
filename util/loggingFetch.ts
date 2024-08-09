import { MetricUnit } from '@aws-lambda-powertools/metrics'
import type { Logger } from '@hello.nrfcloud.com/lambda-helpers/logger'
import type { AddMetricsFn } from '@hello.nrfcloud.com/lambda-helpers/metrics'

export const loggingFetch =
	({ track, log }: { track: AddMetricsFn; log: Logger }) =>
	async (
		url: URL | RequestInfo,
		init?: RequestInit,
	): ReturnType<typeof fetch> => {
		log.debug(`fetch:url`, url.toString())
		log.debug(`fetch:method`, init?.method ?? 'GET')
		if (init?.body !== null && init?.body !== undefined)
			log.debug(`fetch:body`, init.body.toString())

		const start = Date.now()

		const res = await fetch(url, init)

		const responseTime = Date.now() - start
		track('apiResponseTime', MetricUnit.Milliseconds, responseTime)

		log.debug('fetch:responseTime', responseTime.toString())
		log.debug('fetch:status', res.status.toString())

		return res
	}
