import { MetricUnits, logMetrics } from '@aws-lambda-powertools/metrics'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import middy from '@middy/core'
import { fromEnv } from '@nordicsemiconductor/from-env'
import { dailyActiveDevices } from '../kpis/dailyActiveDevices.js'
import { metricsForComponent } from './metrics/metrics.js'

const { tableName } = fromEnv({
	tableName: 'LAST_SEEN_TABLE_NAME',
})(process.env)

const db = new DynamoDBClient({})
const getDailyActiveDevices = dailyActiveDevices(db, tableName)

const { track, metrics } = metricsForComponent('KPIs')

const h = async () => {
	// Make sure we are getting all devices from yesterday,
	const previousHour = new Date(Date.now() - 60 * 60 * 1000)
	const dailyActiveDevicesCount = await getDailyActiveDevices(previousHour)
	track('dailyActive:devices', MetricUnits.Count, dailyActiveDevicesCount)
}

export const handler = middy(h).use(logMetrics(metrics))
