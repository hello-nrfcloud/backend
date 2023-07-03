import {
	noMatch,
	type StepRunResult,
	type StepRunnerArgs,
} from '@nordicsemiconductor/bdd-markdown'
import { setTimeout } from 'node:timers/promises'
import type { World } from '../run-features.js'

export const waitFor = async ({
	step,
	log: {
		step: { progress },
	},
}: StepRunnerArgs<World>): Promise<StepRunResult> => {
	const match = /^I wait for `(?<time>\d+)` seconds?$/.exec(step.title)
	if (match === null) return noMatch

	const waitingTime = Number(match.groups?.time ?? 1)

	progress(`Waiting for ${waitingTime} seconds`)
	await setTimeout(waitingTime * 1000)
}
