import {
	codeBlockOrThrow,
	regExpMatchedStep,
	type StepRunner,
} from '@nordicsemiconductor/bdd-markdown'
import { Type } from '@sinclair/typebox'
import { assert } from 'chai'
import jsonata from 'jsonata'
import { check, objectMatching } from 'tsmatchers'
import { doRequest } from '../lib/doRequest.js'

let currentRequest: ReturnType<typeof doRequest> = {
	match: async () => Promise.reject(new Error(`No request pending!`)),
}

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
		async ({ match: { method, endpoint, withPayload }, log, step }) => {
			const url = new URL(endpoint)

			const headers: HeadersInit = {
				Accept: 'application/json',
			}

			let bodyAsString: string | undefined = undefined
			if (withPayload !== undefined) {
				bodyAsString = JSON.stringify(JSON.parse(codeBlockOrThrow(step).code))
				headers['Content-type'] = 'application/json'
			}

			currentRequest = doRequest(
				url,
				{
					method,
					body: bodyAsString,
					headers,
				},
				log,
			)
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
			await currentRequest.match(async ({ body }) =>
				check(body).is(
					objectMatching({
						'@context': context,
					}),
				),
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
			await currentRequest.match(async ({ body }) => {
				const e = jsonata(exp)
				const result = await e.evaluate(body)
				progress(result)
				assert.notEqual(result, undefined)
				context[storeName] = result
			})
		},
	),
	regExpMatchedStep(
		{
			regExp: /^(?:`(?<exp>[^`]+)` of )?the last response should match$/,
			schema: Type.Object({
				exp: Type.Optional(Type.String()),
			}),
		},
		async ({ step, match: { exp }, log: { progress } }) => {
			await currentRequest.match(async ({ body }) => {
				const expected = JSON.parse(codeBlockOrThrow(step).code)
				progress(expected)
				if (exp !== undefined) {
					const e = jsonata(exp)
					const result = await e.evaluate(body)
					progress(result)
					check(result).is(objectMatching(expected))
				} else {
					check(body).is(objectMatching(expected))
				}
			})
		},
	),
]
