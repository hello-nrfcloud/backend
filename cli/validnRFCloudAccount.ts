import { allAccountScopes } from '../nrfcloud/allAccounts.js'

export const availableAccounts = allAccountScopes.map((scope) =>
	scope.toString().replace(/[^/]*\//, ''),
)
