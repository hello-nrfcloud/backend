import {
	regExpMatchedStep,
	type StepRunner,
} from '@nordicsemiconductor/bdd-markdown'
import { Type } from '@sinclair/typebox'
import { setTimeout } from 'node:timers/promises'

const wait = regExpMatchedStep(
	{
		regExp: /^I wait for `(?<delay>[^`]+)` seconds?$/,
		schema: Type.Object({
			delay: Type.Integer(),
		}),
		converters: {
			delay: (s) => parseInt(s, 10),
		},
	},
	async ({ match: { delay }, log: { progress } }) => {
		progress(`Waiting for ${delay} seconds`)
		await setTimeout(delay * 1000)
	},
)

export const steps = (): StepRunner<Record<string, any>>[] => [wait]
