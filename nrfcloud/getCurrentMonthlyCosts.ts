import type { ValidationError } from 'ajv'
import { validatedFetch } from './validatedFetch.js'
import { Type } from '@sinclair/typebox'

export const getCurrentMonthlyCosts =
	(
		{
			apiKey,
			endpoint,
		}: {
			apiKey: string
			endpoint: URL
		},
		fetchImplementation?: typeof fetch,
	) =>
	async (): Promise<
		| {
				error: Error | ValidationError
		  }
		| { currentMonthTotalCost: number }
	> => {
		const vf = validatedFetch({ endpoint, apiKey }, fetchImplementation)
		const maybeResult = await vf(
			{ resource: 'account' },
			Type.Object({
				plan: Type.Object({
					currentMonthTotalCost: Type.Number(), // e.g. 2.73
				}),
			}),
		)
		if ('error' in maybeResult) {
			return maybeResult
		}
		const currentMonthTotalCost = maybeResult.result.plan.currentMonthTotalCost

		return { currentMonthTotalCost }
	}
