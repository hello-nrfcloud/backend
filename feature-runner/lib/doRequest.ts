import { type Logger } from '@nordicsemiconductor/bdd-markdown'
import pRetry from 'p-retry'

type Result = {
	response: Response
	body?: Record<string, unknown>
}
export const doRequest = (
	url: URL,
	request: RequestInit,
	logger?: Logger,
	fetchImplementation?: typeof fetch,
): {
	match: (assertFn: (args: Result) => Promise<unknown>) => Promise<void>
} => {
	let requestInFlight: Promise<Result> | undefined = undefined

	const send = async () => {
		const endpoint = url.toString()
		const { method, headers, body } = request
		logger?.progress(`> ${method} ${endpoint}`)
		Object.entries(headers ?? {}).forEach(([k, v]) =>
			logger?.progress(`> ${k}: ${v}`),
		)
		if (body !== undefined)
			logger?.progress(`> ${body?.toString() ?? '<no body>'}`)

		const res = await (fetchImplementation ?? fetch)(url, request)
		logger?.progress(`< ${res.status} ${res.statusText}`)
		for (const [k, v] of res.headers.entries()) {
			logger?.progress(`< ${k}: ${v}`)
		}
		if (res.headers.get('content-type')?.includes('json') ?? false) {
			const responseBody = await res.json()
			logger?.progress(`< ${JSON.stringify(responseBody)}`)
			return {
				response: res,
				body: responseBody,
			}
		}
		return {
			response: res,
		}
	}

	return {
		match: async (
			assertFn: (args: Result) => Promise<unknown>,
		): Promise<void> => {
			if (requestInFlight === undefined) {
				requestInFlight = send()
			}

			const { response, body } = await requestInFlight

			try {
				logger?.progress(`Checking ...`)
				await assertFn({
					response,
					body,
				})
				logger?.progress(`Check passed ...`)
			} catch (err) {
				logger?.progress(`Retrying ...`)
				await new Promise((resolve) => setTimeout(resolve, 1000))
				await pRetry(
					async () => {
						requestInFlight = send()
						const { response, body } = await requestInFlight
						await assertFn({
							response,
							body,
						})
					},
					{
						retries: 4,
						minTimeout: 1000,
						maxTimeout: 2000,
						onFailedAttempt: (error) => {
							logger?.progress(`attempt #${error.attemptNumber}`)
						},
					},
				)
			}
		},
	}
}
