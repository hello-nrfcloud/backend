import {
	matchGroups,
	noMatch,
	type StepRunResult,
	type StepRunner,
	type StepRunnerArgs,
} from '@nordicsemiconductor/bdd-markdown'
import { Type } from '@sinclair/typebox'
import { hashSHA1 } from '../../util/hashSHA1.js'
import {
	deleteSettings,
	getSettings,
	type putSettings,
} from '../../util/settings.js'
import type { World } from '../run-features.js'

const createConfigStepRunners = ({
	configWriter,
}: {
	configWriter: ReturnType<typeof putSettings>
}): StepRunner<World>[] => {
	const setupDeviceShadowFetchingConfiguration = async ({
		step,
		log: {
			step: { progress },
		},
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
			/^device shadow fetching config for model `(?<model>[^`]+)` is `(?<interval>[^`]+)`$/,
			step.title,
		)

		if (match === null) return noMatch

		// ssm path must be letter, number, .(dot), -(dash), or _(underscore)
		const model = hashSHA1(match.model)
		const interval = match.interval

		progress(`Set fetching interval for ${model} as ${interval} seconds`)
		await configWriter({ property: model, value: `${interval}` })
	}

	return [setupDeviceShadowFetchingConfiguration]
}

export const configStepRunners = ({
	configWriter,
	configRemover,
	configSettings,
}: {
	configWriter: ReturnType<typeof putSettings>
	configRemover: ReturnType<typeof deleteSettings>
	configSettings: ReturnType<typeof getSettings>
}): {
	steps: StepRunner<World>[]
	cleanup: () => Promise<void>
} => ({
	steps: createConfigStepRunners({ configWriter }),
	cleanup: async () => {
		const settings = await configSettings()
		for (const property in settings) {
			await configRemover({ property })
		}
	},
})
