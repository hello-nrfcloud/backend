import {
	codeBlockOrThrow,
	regExpMatchedStep,
	type StepRunner,
} from '@nordicsemiconductor/bdd-markdown'
import { Type } from '@sinclair/typebox'
import { assert } from 'chai'
import jsonata from 'jsonata'
import pRetry from 'p-retry'
import { check, objectMatching } from 'tsmatchers'

let lastResponse: Record<string, unknown> | undefined = undefined

export const steps: StepRunner<Record<string, any>>[] = [
	regExpMatchedStep(
		{
			regExp:
				/^I `(?<method>GET|POST|PUT|DELETE)`( to)? `(?<endpoint>https?:\/\/[^`]+)`(?<withPayload> with)?$/,
			schema: Type.Object({
				method: Type.Union([
					Type.Literal('GET'),
					Type.Literal('POST'),
					Type.Literal('PUT'),
					Type.Literal('DELETE'),
				]),
				endpoint: Type.String({ minLength: 1 }),
				withPayload: Type.Optional(Type.Literal(' with')),
			}),
		},
		async ({
			match: { method, endpoint, withPayload },
			log: { progress },
			step,
		}) => {
			const url = new URL(endpoint)

			const headers: HeadersInit = {
				Accept: 'application/json',
			}

			progress(`> ${method} ${endpoint}`)
			Object.entries(headers).forEach(([k, v]) => progress(`> ${k}: ${v}`))
			let bodyAsString: string | undefined = undefined
			if (withPayload !== undefined) {
				const body = JSON.parse(codeBlockOrThrow(step).code)
				bodyAsString = JSON.stringify(body)
				headers['Content-type'] = 'application/json'
				progress(`> ${body}`)
			}

			const res = await pRetry(
				async () => {
					const res = await fetch(url, {
						method,
						body: bodyAsString,
						headers,
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
			progress(`< ${res.status} ${res.statusText}`)
			for (const [k, v] of res.headers.entries()) {
				progress(`< ${k}: ${v}`)
			}
			lastResponse = await res.json()
			progress(`< ${JSON.stringify(lastResponse)}`)
		},
	),
	regExpMatchedStep(
		{
			regExp: /^I should receive a `(?<context>https?:\/\/[^`]+)` response$/,
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
	regExpMatchedStep(
		{
			regExp: /^`(?<exp>[^`]+)` of the last response should match$/,
			schema: Type.Object({
				exp: Type.String(),
			}),
		},
		async ({ step, match: { exp }, log: { progress } }) => {
			const e = jsonata(exp)
			const result = await e.evaluate(lastResponse)
			const expected = JSON.parse(codeBlockOrThrow(step).code)
			progress(result)
			progress(expected)
			check(result).is(objectMatching(expected))
		},
	),
]
