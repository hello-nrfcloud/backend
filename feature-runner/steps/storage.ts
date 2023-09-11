import {
	groupMatcher,
	type StepRunner,
} from '@nordicsemiconductor/bdd-markdown'
import { Type } from '@sinclair/typebox'
import assert from 'node:assert/strict'
import jsonata from 'jsonata'

export const store = groupMatcher(
	{
		regExp: /^I store `(?<exp>[^`]+)` into `(?<storeName>[^`]+)`$/,
		schema: Type.Object({
			exp: Type.String(),
			storeName: Type.String(),
		}),
	},
	async ({ match: { exp, storeName }, log: { progress }, context }) => {
		const e = jsonata(exp)
		const result = await e.evaluate(context)
		progress(`Evaluate: ${result}`)
		assert.notEqual(result, undefined)

		context[storeName] = result
	},
)

// async ({
// 	step,
// 	log: {
// 		step: { progress },
// 	},
// 	context,
// }: StepRunnerArgs<{ [k: string]: any }>): Promise<StepRunResult> => {
// 	const match = matchGroups(
// 		Type.Object({
// 			exp: Type.String(),
// 			storeName: Type.String(),
// 		}),
// 	)(/^I store `(?<exp>[^`]+)` into `(?<storeName>[^`]+)`$/, step.title)

// 	if (match === null) return noMatch

// 	const e = jsonata(match.exp)
// 	const result = await e.evaluate(context)
// 	progress(`Evaluate: ${result}`)
// 	assert.notEqual(result, undefined)

// 	context[match.storeName] = result
// }

export const steps = (): StepRunner<Record<string, any>>[] => [store]
