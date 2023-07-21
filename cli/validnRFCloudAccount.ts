import { Scope } from '../util/settings.js'
import { allAccountScopes } from '../nrfcloud/allAccounts.js'

const scopePrefix = 'thirdParty/'

export const convertTonRFAccount = (v: string): Scope => {
	return `${scopePrefix}${v}` as Scope
}

export const validnRFCloudAccount = (
	v: Scope,
): v is (typeof allAccountScopes)[number] => {
	return allAccountScopes.some((s) => s === v)
}

export const availableAccounts = allAccountScopes.map((scope) =>
	scope.toString().replace(/[^/]*\//, ''),
)
