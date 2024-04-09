import {
	type StepRunner,
	regExpMatchedStep,
} from '@nordicsemiconductor/bdd-markdown'
import { Type } from '@sinclair/typebox'
import { hashSHA1 } from '../../util/hashSHA1.js'
import { remove, get, type put } from '@bifravst/aws-ssm-settings-helpers'

const createConfigStepRunners = ({
	configWriter,
}: {
	configWriter: ReturnType<ReturnType<typeof put>>
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
	configWriter: ReturnType<ReturnType<typeof put>>
	configRemover: ReturnType<ReturnType<typeof remove>>
	configSettings: ReturnType<ReturnType<typeof get>>
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
