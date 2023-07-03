import {
	matchGroups,
	noMatch,
	type StepRunResult,
	type StepRunner,
	type StepRunnerArgs,
} from '@nordicsemiconductor/bdd-markdown'
import { Type } from '@sinclair/typebox'
import { assert } from 'chai'
import jsonata from 'jsonata'
import type { World } from '../run-features.js'

const store = async ({
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
	assert.isDefined(result)

	context[match.storeName] = result
}

const storeSeries = async ({
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
			step: Type.Number(),
			iteration: Type.Integer(),
			direction: Type.String(),
		}),
		{
			step: (n) => Number(n),
			iteration: (n) => Number(n),
		},
	)(
		/^I store `(?<exp>[^`]+)` into `(?<storeName>[^`]+)` and generate a series with (?<direction>decrement|increment) of `(?<step>[^`]+)` minutes? each time for `(?<iteration>[^`]+)` iterations?$/,
		step.title,
	)

	if (match === null) return noMatch

	const e = jsonata(match.exp)
	const result = (await e.evaluate(context)) as number
	progress(`Evaluate: ${result}`)
	assert.isDefined(result)

	context[match.storeName] = result
	let value = result
	const dir = match.direction === 'decrement' ? -1 : 1
	for (let i = 1; i <= match.iteration; i++) {
		value += dir * match.step * 60 * 1000
		context[`${match.storeName}${i}`] = value
	}
}

export const steps = (): StepRunner<World>[] => [store, storeSeries]
