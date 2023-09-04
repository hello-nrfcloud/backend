import { STACK_NAME } from '../cdk/stacks/stackConfig.js'
import { SSMClient } from '@aws-sdk/client-ssm'
import { calculateCostsPerAccount } from './calculateCostsPerAccount.js'
import { testDateAugust } from './calculateCosts.spec.js'

jest.mock('.././nrfcloud/allAccounts.js', () => ({
	getAllnRFCloudAccounts: async () => {
		return ['account1', 'account2']
	},
}))
jest.mock('./getCostSummaryFromAPI.js', () => ({
	getCostSummaryFromAPI: async () => {
		return {
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
	},
}))

const ssm = new SSMClient({})

describe('calculateCostsPerAccount()', () => {
	it('should calculate costs per Account', async () => {
		const expected = { account1: 40.15, account2: 40.15 }
		expect(
			await calculateCostsPerAccount({
				ssm,
				stackName: STACK_NAME,
				date: testDateAugust,
			}),
		).toEqual(expected)
	})
})
