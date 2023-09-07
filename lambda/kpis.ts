import { MetricUnits, logMetrics } from '@aws-lambda-powertools/metrics'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import middy from '@middy/core'
import { fromEnv } from '@nordicsemiconductor/from-env'
import { dailyActiveDevices } from '../kpis/dailyActiveDevices.js'
import { dailyActiveFingerprints } from '../kpis/dailyActiveFingerprints.js'
import { metricsForComponent } from './metrics/metrics.js'
import { SSMClient } from '@aws-sdk/client-ssm'
import { getAllnRFCloudAccounts } from '../nrfcloud/allAccounts.js'
import { accountApiClient } from '../nrfcloud/accountApiClient.js'

const { lastSeenTableName, devicesTableName, stackName } = fromEnv({
	lastSeenTableName: 'LAST_SEEN_TABLE_NAME',
	devicesTableName: 'DEVICES_TABLE_NAME',
	stackName: 'STACK_NAME',
})(process.env)

const ssm = new SSMClient({})
const db = new DynamoDBClient({})
const getDailyActiveDevices = dailyActiveDevices(db, lastSeenTableName)
const getDailyActiveFingerprints = dailyActiveFingerprints(db, devicesTableName)

const { track, metrics } = metricsForComponent('KPIs')

const h = async () => {
	// Make sure we are getting all data from yesterday,
	const previousHour = new Date(Date.now() - 60 * 60 * 1000)
	await Promise.all([
		getDailyActiveDevices(previousHour).then((dailyActiveDevicesCount) => {
			console.log({ dailyActiveDevicesCount })
			track('dailyActive:devices', MetricUnits.Count, dailyActiveDevicesCount)
		}),
		getDailyActiveFingerprints(previousHour).then(
			(dailyActiveFingerprintCount) => {
				console.log({ dailyActiveFingerprintCount })
				track(
					'dailyActive:fingerprints',
					MetricUnits.Count,
					dailyActiveFingerprintCount,
				)
			},
		),
		// Current month's nRF Cloud costs
		...(await getAllnRFCloudAccounts({ ssm, stackName })).map(
			async (account) => {
				const apiClient = await accountApiClient(account, stackName, ssm)
				const maybeAccount = await apiClient.account()
				if ('error' in maybeAccount) {
					console.error(maybeAccount.error)
				} else {
					const costs = maybeAccount.account.plan.currentMonthTotalCost
					console.log({ [`${account}:costs`]: costs })
					track(`nrfCloudMonthlyCosts:${account}`, MetricUnits.Count, costs)
				}
			},
		),
	])
}

export const handler = middy(h).use(logMetrics(metrics))
