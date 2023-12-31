import {
	type StepRunner,
	regExpMatchedStep,
} from '@nordicsemiconductor/bdd-markdown'
import { Type } from '@sinclair/typebox'
import { hashSHA1 } from '../../util/hashSHA1.js'
import {
	deleteSettings,
	getSettings,
	type putSettings,
} from '../../util/settings.js'

const createConfigStepRunners = ({
	configWriter,
}: {
	configWriter: ReturnType<typeof putSettings>
}): StepRunner<Record<string, any>>[] => {
	const setupDeviceShadowFetchingConfiguration = regExpMatchedStep(
		{
			regExp:
				/^device shadow fetching config for model `(?<model>[^`]+)` is `(?<interval>[^`]+)`$/,
			schema: Type.Object({
				model: Type.String(),
				interval: Type.Integer(),
			}),
			converters: {
				interval: (s) => parseInt(s, 10),
			},
		},
		async ({ match: { model, interval }, log: { progress } }) => {
			const modelHash = hashSHA1(model)
			progress(`Set fetching interval for ${modelHash} as ${interval} seconds`)
			await configWriter({ property: modelHash, value: `${interval}` })
		},
	)

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
	steps: StepRunner<Record<string, any>>[]
	cleanup: () => Promise<void>
} => ({
	steps: createConfigStepRunners({ configWriter }),
	cleanup: async () => {
		try {
			const settings = await configSettings()
			for (const property in settings) {
				await configRemover({ property })
			}
		} catch {
			// just ignore any error if there is no configure
		}
	},
})
