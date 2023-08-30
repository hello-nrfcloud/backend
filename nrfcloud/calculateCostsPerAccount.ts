import { calculateCosts } from '../calculateCosts.js'
import { SSMClient } from '@aws-sdk/client-ssm'
import { getAllnRFCloudAccounts } from './allAccounts.js'
import { getCostSummaryFromAPI } from './getCostSummaryFromAPI.js'

export type AccountObject = { [key: string]: number }

export const calculateCostsPerAccount = async ({
	ssm,
	stackName,
}: {
	ssm: SSMClient
	stackName: string
}): Promise<AccountObject> => {
	const accounts = await getAllnRFCloudAccounts({
		ssm,
		stackName,
	})
	const returnObject: AccountObject = {}
	for (const account of accounts) {
		const summary = await getCostSummaryFromAPI(account, stackName, ssm)
		returnObject[account] = calculateCosts(summary)
	}
	return returnObject
}
