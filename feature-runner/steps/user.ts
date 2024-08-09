import { regExpMatchedStep, type StepRunner } from '@bifravst/bdd-markdown'
import { generateCode } from '@hello.nrfcloud.com/proto/fingerprint'
import { Type } from '@sinclair/typebox'

export const user = regExpMatchedStep(
	{
		regExp: /^I have a user's email in `(?<storeName>[^`]+)`$/,
		schema: Type.Object({
			storeName: Type.String(),
		}),
	},
	async ({ match: { storeName }, log: { progress }, context }) => {
		const randomEmail = `${generateCode()}@example.com`
		progress(randomEmail)

		context[storeName] = randomEmail
	},
)

export const steps: StepRunner<Record<string, any>>[] = [user]
