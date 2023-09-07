import { STACK_NAME } from '../cdk/stacks/stackConfig.js'
import { SSMClient } from '@aws-sdk/client-ssm'
import { calculateCostsPerAccount } from './calculateCostsPerAccount.js'
const testDateAugust = 1691145383000

const testSummary = {
	currentDevices: {
		total: 9,
		bluetoothLE: 0,
		gateway: 0,
		generic: 9,
	},
	services: [
		{
			date: '2023-08',
			fotaJobExecutions: 0,
			storedDeviceMessages: 120124,
			locationServices: {
				AGPS: {
					requests: 120,
					devicesUsing: 2,
				},
				PGPS: {
					requests: 0,
					devicesUsing: 0,
				},
				SCELL: {
					requests: 13241,
					devicesUsing: 171,
				},
				MCELL: {
					requests: 6939,
					devicesUsing: 1,
				},
				WIFI: {
					requests: 0,
					devicesUsing: 0,
				},
			},
		},
		{
			date: '2023-07',
			fotaJobExecutions: 2,
			storedDeviceMessages: 613277,
			locationServices: {
				AGPS: {
					requests: 42,
					devicesUsing: 2,
				},
				PGPS: {
					requests: 0,
					devicesUsing: 0,
				},
				SCELL: {
					requests: 10039,
					devicesUsing: 56,
				},
				MCELL: {
					requests: 75486,
					devicesUsing: 2,
				},
				WIFI: {
					requests: 0,
					devicesUsing: 0,
				},
			},
		},
	],
}

const ssm = new SSMClient({})

describe('calculateCostsPerAccount()', () => {
	it('should calculate costs per Account', async () => {
		const expected = { account1: 40.15, account2: 40.15 }
		expect(
			await calculateCostsPerAccount({
				ssm,
				stackName: STACK_NAME,
				date: testDateAugust,
				getAllnRFCloudAccounts: async () => ['account1', 'account2'],
				getCostSummaryFromAPI: async () => testSummary,
			}),
		).toEqual(expected)
	})

	it('should use SSM and stackName to get nRFCloud accounts', async () => {
		const getAllnRFCloudAccounts = jest.fn().mockImplementation(() => {
			return ['account1', 'account2']
		})
		await calculateCostsPerAccount({
			ssm,
			stackName: STACK_NAME,
			date: testDateAugust,
			getAllnRFCloudAccounts,
			getCostSummaryFromAPI: async () => testSummary,
		})
		expect(getAllnRFCloudAccounts).toHaveBeenCalledWith({
			ssm,
			stackName: STACK_NAME,
		})
	})

	it('should use accountname, SSM and stackName to get cost summary from API', async () => {
		const getCostSummaryFromAPI = jest.fn().mockImplementation(() => {
			return testSummary
		})
		await calculateCostsPerAccount({
			ssm,
			stackName: STACK_NAME,
			date: testDateAugust,
			getAllnRFCloudAccounts: async () => ['account1'],
			getCostSummaryFromAPI,
		})
		expect(getCostSummaryFromAPI).toHaveBeenCalledWith(
			'account1',
			STACK_NAME,
			ssm,
		)
	})
})
