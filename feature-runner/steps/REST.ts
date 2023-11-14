import {
	codeBlockOrThrow,
	regExpMatchedStep,
	type StepRunner,
} from '@nordicsemiconductor/bdd-markdown'
import { Type } from '@sinclair/typebox'
import { assert } from 'chai'
import jsonata from 'jsonata'
import pRetry from 'p-retry'

let lastResponse: Record<string, unknown> | undefined = undefined

export const steps: StepRunner<Record<string, any>>[] = [
	regExpMatchedStep(
		{
			regExp:
				/^I `(?<method>GET|POST|PUT|DELETE)`( to)? `(?<endpoint>https?:\/\/[^`]+)` with$/,
			schema: Type.Object({
				method: Type.Union([
					Type.Literal('GET'),
					Type.Literal('POST'),
					Type.Literal('PUT'),
					Type.Literal('DELETE'),
				]),
				endpoint: Type.String({ minLength: 1 }),
			}),
		},
		async ({ match: { method, endpoint }, log: { progress }, step }) => {
			const url = new URL(endpoint)
			const body = JSON.parse(codeBlockOrThrow(step).code)

			progress(`> ${method} ${endpoint}`)
			progress(`> ${JSON.stringify(body)}`)

			const res = await pRetry(
				async () => {
					const res = await fetch(url, {
						method,
						body: JSON.stringify(body),
						headers: {
							'Content-type': 'application/json',
							Accept: 'application/json',
						},
					})
					if (!res.ok) {
						const error = await res.text()
						progress(`<! ${error}`)
						throw new Error(`Request failed: ${error}`)
					}
					return res
				},
				{
					retries: 5,
					minTimeout: 1000,
					maxTimeout: 2000,
					onFailedAttempt: (error) => {
						progress(`attempt #${error.attemptNumber}`)
					},
				},
			)

			lastResponse = await res.json()
			progress(`< ${JSON.stringify(lastResponse)}`)
		},
	),
	regExpMatchedStep(
		{
			regExp: /^the response should be a `(?<context>https?:\/\/[^`]+)`$/,
			schema: Type.Object({
				context: Type.String({ minLength: 1 }),
			}),
		},
		async ({ match: { context } }) => {
			if (
				lastResponse === undefined ||
				!('@context' in (lastResponse ?? {})) ||
				typeof lastResponse['@context'] !== 'string'
			)
				throw new Error(`No @context present in last response!`)
			assert.equal(
				new URL(context).toString(),
				new URL(lastResponse['@context']).toString(),
			)
		},
	),
	regExpMatchedStep(
		{
			regExp:
				/^I store `(?<exp>[^`]+)` of the last response into `(?<storeName>[^`]+)`$/,
			schema: Type.Object({
				exp: Type.String(),
				storeName: Type.String(),
			}),
		},
		async ({ match: { exp, storeName }, log: { progress }, context }) => {
			const e = jsonata(exp)
			const result = await e.evaluate(lastResponse)
			progress(result)
			assert.notEqual(result, undefined)
			context[storeName] = result
		},
	),
]
