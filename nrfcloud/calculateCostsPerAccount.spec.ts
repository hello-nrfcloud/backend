import data from '.././api.json'
import { STACK_NAME } from '../cdk/stacks/stackConfig.js'
import { SSMClient } from '@aws-sdk/client-ssm'
import { calculateCostsPerAccount } from './calculateCostsPerAccount.js'
jest.mock('.././nrfcloud/allAccounts.js', () => ({
	getAllnRFCloudAccounts: async () => {
		return ['account1', 'account2']
	},
}))
jest.mock('./getCostSummaryFromAPI.js', () => ({
	getCostSummaryFromAPI: async () => {
		return data
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
