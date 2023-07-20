import { Scope } from '../util/settings.js'

const scopePrefix = 'thirdParty/'

export const convertTonRFAccount = (v: string): Scope => {
	return `${scopePrefix}${v}` as Scope
}

export const validnRFCloudAccount = (
	v: Scope,
): v is Scope.EXEGER_CONFIG | Scope.NODIC_CONFIG => {
	const validScopes = [Scope.EXEGER_CONFIG, Scope.NODIC_CONFIG]
	return validScopes.some((s) => s === v)
}
