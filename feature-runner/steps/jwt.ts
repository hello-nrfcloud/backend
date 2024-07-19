import {
	codeBlockOrThrow,
	regExpMatchedStep,
	type StepRunner,
} from '@bifravst/bdd-markdown'
import { Type } from '@sinclair/typebox'
import jsonwebtoken from 'jsonwebtoken'

const pks = new Map<string, string>()

export const pk = regExpMatchedStep(
	{
		regExp: /^this is the JWT private key for the key `(?<keyId>[^`]+)`$/,
		schema: Type.Object({
			keyId: Type.String(),
		}),
	},
	async ({ match: { keyId }, step }) => {
		pks.set(keyId, codeBlockOrThrow(step).code)
	},
)

// I have a JWT in `(?<storageKey>[^`]+)` signed with the key `(?<keyId>[^`]+)` and with this payload

export const jwt = regExpMatchedStep(
	{
		regExp:
			/^I have a JWT in `(?<storageKey>[^`]+)` signed with the key `(?<keyId>[^`]+)` and with this payload$/,
		schema: Type.Object({
			storageKey: Type.String(),
			keyId: Type.String(),
		}),
	},
	async ({
		match: { keyId, storageKey },
		step,
		context,
		log: { progress },
	}) => {
		const pk = pks.get(keyId)
		if (pk === undefined)
			throw new Error(`No private key found for key ID ${keyId}!`)
		const { aud, ...payload } = JSON.parse(codeBlockOrThrow(step).code)
		context[storageKey] = jsonwebtoken.sign(payload, pk, {
			algorithm: 'ES512',
			expiresIn: '1h',
			audience: aud ?? 'hello.nrfcloud.com',
			keyid: keyId,
		})
		progress(context[storageKey])
	},
)

export const steps: StepRunner<Record<string, any>>[] = [pk, jwt]
