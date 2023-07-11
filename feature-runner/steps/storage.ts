import {
	matchGroups,
	noMatch,
	type StepRunResult,
	type StepRunner,
	type StepRunnerArgs,
} from '@nordicsemiconductor/bdd-markdown'
import { Type } from '@sinclair/typebox'
import assert from 'node:assert/strict'
import jsonata from 'jsonata'
import type { World } from '../run-features.js'

export const store = async ({
	step,
	log: {
		step: { progress },
	},
	context,
}: StepRunnerArgs<{ [k: string]: any }>): Promise<StepRunResult> => {
	const match = matchGroups(
		Type.Object({
			exp: Type.String(),
			storeName: Type.String(),
		}),
	)(/^I store `(?<exp>[^`]+)` into `(?<storeName>[^`]+)`$/, step.title)

	if (match === null) return noMatch

	const e = jsonata(match.exp)
	const result = await e.evaluate(context)
	progress(`Evaluate: ${result}`)
	assert.notEqual(result, undefined)

	context[match.storeName] = result
}

export const steps = (): StepRunner<World>[] => [store]
