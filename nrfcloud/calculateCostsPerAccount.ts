import { calculateCosts, type UsageSummary } from './calculateCosts.js'
import { SSMClient } from '@aws-sdk/client-ssm'

export type AccountObject = { [key: string]: number }

export const calculateCostsPerAccount = async ({
	ssm,
	stackName,
	date,
	getAllnRFCloudAccounts,
	getCostSummaryFromAPI,
}: {
	ssm: SSMClient
	stackName: string
	date: number
	getAllnRFCloudAccounts: ({
		ssm,
		stackName,
	}: {
		ssm: SSMClient
		stackName: string
	}) => Promise<string[]>
	getCostSummaryFromAPI: (
		account: string,
		stackName: string,
		ssm: SSMClient,
	) => Promise<UsageSummary>
}): Promise<AccountObject> => {
	const accounts = await getAllnRFCloudAccounts({
		ssm,
		stackName,
	})
	const returnObject: AccountObject = {}
	for (const account of accounts) {
		const summary = await getCostSummaryFromAPI(account, stackName, ssm)
		returnObject[account] = calculateCosts(summary, date)
	}
	return returnObject
}
