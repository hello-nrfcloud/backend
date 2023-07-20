import type { SSMClient } from '@aws-sdk/client-ssm'
import { Scope, getSettings } from '../util/settings.js'

export const allAccountScopes = [Scope.EXEGER_CONFIG, Scope.NODIC_CONFIG]

export const getAllAccountsSettings =
	<T extends Record<string, string>>({
		ssm,
		stackName,
	}: {
		ssm: SSMClient
		stackName: string
	}) =>
	async (): Promise<Record<string, T>> =>
		allAccountScopes.reduce(
			async (resultPromise, scope) => {
				const result = await resultPromise
				const account = scope.toString().replace(/([^/]+\/)/, '')
				const settings = await getSettings<T>({
					ssm,
					stackName,
					scope,
				})()
				return {
					...result,
					[account]: settings,
				}
			},
			Promise.resolve({} as Record<string, T>),
		)
