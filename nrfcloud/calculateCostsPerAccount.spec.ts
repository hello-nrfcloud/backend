import { calculateCosts } from '../calculateCosts.js'
import data from '.././api.json'
import { STACK_NAME } from '../cdk/stacks/stackConfig.js'
import { SSMClient } from '@aws-sdk/client-ssm'
import { getAllnRFCloudAccounts } from './allAccounts.js'
jest.mock('.././nrfcloud/allAccounts.js', () => ({
	getAllnRFCloudAccounts: async () => {
		return ['account1', 'account2']
	},
}))

const ssm = new SSMClient({})

describe('calculateCostsPerAccount()', () => {
	it('should calculate costs per Account', async () => {
		const expected = { account1: 40.15, account2: 40.15 }
		expect(
			await calculateCostsPerAccount({ ssm, stackName: STACK_NAME }),
		).toEqual(expected)
	})
})
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
		//make api call to https://api.nrfcloud.com/v1/account/usage/summary for that user
		//const summary = fetch(https://api.nrfcloud.com/v1/account/usage/summary)
		const summary = data
		returnObject[account] = calculateCosts(summary)
	}
	return returnObject
}
