import { SSMClient } from '@aws-sdk/client-ssm'
import { accountApiClient } from './accountApiClient.js'
import type { ValidationError } from 'ajv'

export const getCurrentMonthlyCosts =
	({
		account,
		stackName,
		ssm,
	}: {
		account: string
		stackName: string
		ssm: SSMClient
	}) =>
	async (): Promise<
		| {
				error: Error | ValidationError
		  }
		| { currentMonthTotalCost: number }
	> => {
		const apiClient = await accountApiClient(account, stackName, ssm)
		const maybeAccount = await apiClient.account()
		if ('error' in maybeAccount) {
			return maybeAccount
		}
		const currentMonthTotalCost =
			maybeAccount.account.plan.currentMonthTotalCost

		return { currentMonthTotalCost }
	}
