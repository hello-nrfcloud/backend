import {
	matchGroups,
	noMatch,
	type StepRunResult,
	type StepRunner,
	type StepRunnerArgs,
} from '@nordicsemiconductor/bdd-markdown'
import { Type } from '@sinclair/typebox'
import type { World } from '../run-features.js'

const setupDeviceShadowFetchingConfiguration = async ({
	step,
	log: {
		step: { progress },
	},
	context: { configWriter },
}: StepRunnerArgs<World>): Promise<StepRunResult> => {
	const match = matchGroups(
		Type.Object({
			model: Type.String(),
			interval: Type.Integer(),
		}),
		{
			interval: (s) => parseInt(s, 10),
		},
	)(
		/^device shadow fetching for model `(?<model>[^`]+)` is `(?<interval>[^`]+)` seconds$/,
		step.title,
	)

	if (match === null) return noMatch

	// ssm path must be letter, number, .(dot), -(dash), or _(underscore)
	const model = match.model.replace(/[^\w.-]/g, '_')
	const interval = match.interval

	progress(`Set fetching interval for ${model} as ${interval} seconds`)
	await configWriter({ property: model, value: `${interval}` })
}

export const steps = (): StepRunner<World>[] => [
	setupDeviceShadowFetchingConfiguration,
]
