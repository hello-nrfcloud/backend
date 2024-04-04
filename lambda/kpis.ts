import { MetricUnit } from '@aws-lambda-powertools/metrics'
import { logMetrics } from '@aws-lambda-powertools/metrics/middleware'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import middy from '@middy/core'
import { fromEnv } from '@nordicsemiconductor/from-env'
import { dailyActiveDevices } from '../kpis/dailyActiveDevices.js'
import { dailyActiveFingerprints } from '../kpis/dailyActiveFingerprints.js'
import { metricsForComponent } from '@hello.nrfcloud.com/lambda-helpers/metrics'
import { SSMClient } from '@aws-sdk/client-ssm'
import { getAllnRFCloudAccounts } from '../nrfcloud/allAccounts.js'
import { getCurrentMonthlyCosts } from '../nrfcloud/getCurrentMonthlyCosts.js'
import { getAPISettings, type Settings } from '../nrfcloud/settings.js'

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

const accountSettings: Record<
	string,
	Promise<Pick<Settings, 'apiKey' | 'apiEndpoint'>>
> = {}

const h = async () => {
	// Make sure we are getting all data from yesterday,
	const previousHour = new Date(Date.now() - 60 * 60 * 1000)
	await Promise.all([
		getDailyActiveDevices(previousHour).then((dailyActiveDevicesCount) => {
			console.log({ dailyActiveDevicesCount })
			track('dailyActive:devices', MetricUnit.Count, dailyActiveDevicesCount)
		}),
		getDailyActiveFingerprints(previousHour).then(
			(dailyActiveFingerprintCount) => {
				console.log({ dailyActiveFingerprintCount })
				track(
					'dailyActive:fingerprints',
					MetricUnit.Count,
					dailyActiveFingerprintCount,
				)
			},
		),
		// Current month's nRF Cloud costs
		...(await getAllnRFCloudAccounts({ ssm, stackName })).map(
			async (account) => {
				const settingsPromise =
					accountSettings[account] ??
					getAPISettings({
						ssm,
						stackName,
						account,
					})()
				accountSettings[account] = settingsPromise
				const { apiKey, apiEndpoint } = await settingsPromise
				const maybeCosts = await getCurrentMonthlyCosts({
					apiKey,
					endpoint: apiEndpoint,
				})()
				if ('error' in maybeCosts) {
					console.error(maybeCosts.error)
				} else {
					const costs = maybeCosts.currentMonthTotalCost
					console.log({ [`${account}:costs`]: costs })
					track(`nrfCloudMonthlyCosts:${account}`, MetricUnit.Count, costs)
				}
			},
		),
	])
}

export const handler = middy(h).use(logMetrics(metrics))
