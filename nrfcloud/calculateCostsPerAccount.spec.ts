import { calculateCosts } from '../calculateCosts'
import data from '.././api.json'
import { STACK_NAME } from '../cdk/stacks/stackConfig.js'
import { SSMClient } from '@aws-sdk/client-ssm'
import { getAllnRFCloudAccounts } from '.././nrfcloud/allAccounts.js'

const ssm = new SSMClient({})

describe('calculateCostsPerAccount()', () => {
	it('should calculate costs per Account', async () => {
		const expected = { acc1: 0, acc2: 0 }
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
}) => {
	const accounts = await getAllnRFCloudAccounts({
		ssm,
		stackName,
	})
	//const accounts = ['acc1', 'acc2']
	console.log(accounts)
	//get accounts using allAccounts ??
	let returnObject: AccountObject = {}
	for (const account of accounts) {
		//make api call to https://api.nrfcloud.com/v1/account/usage/summary for that user

		//const summary = fetch(https://api.nrfcloud.com/v1/account/usage/summary)
		console.log(account)
		const summary = data
		returnObject[account] = calculateCosts(summary)
	}
	return returnObject
}
