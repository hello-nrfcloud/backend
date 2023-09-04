import { MetricUnits, logMetrics } from '@aws-lambda-powertools/metrics'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import middy from '@middy/core'
import { fromEnv } from '@nordicsemiconductor/from-env'
import { dailyActiveDevices } from '../kpis/dailyActiveDevices.js'
import { dailyActiveFingerprints } from '../kpis/dailyActiveFingerprints.js'
import { metricsForComponent } from './metrics/metrics.js'
import { calculateCostsPerAccount } from '../nrfcloud/calculateCostsPerAccount.js'
import { SSMClient } from '@aws-sdk/client-ssm'

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
	const [
		dailyActiveDevicesCount,
		dailyActiveFingerprintCount,
		costsPerAccount,
	] = await Promise.all([
		getDailyActiveDevices(previousHour),
		getDailyActiveFingerprints(previousHour),
		calculateCostsPerAccount({
			ssm,
			stackName,
			date: Date.now(),
		}),
	])
	console.log({
		dailyActiveDevicesCount,
		dailyActiveFingerprintCount,
		costsPerAccount,
	})
	for (const acc in costsPerAccount) {
		track(`nrfCloudPrices:${acc}`, MetricUnits.Count, costsPerAccount[acc] ?? 0)
	}
	track('dailyActive:devices', MetricUnits.Count, dailyActiveDevicesCount)
	track(
		'dailyActive:fingerprints',
		MetricUnits.Count,
		dailyActiveFingerprintCount,
	)
}

export const handler = middy(h).use(logMetrics(metrics))
