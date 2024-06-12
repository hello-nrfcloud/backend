import { MetricUnit } from '@aws-lambda-powertools/metrics'
import { logMetrics } from '@aws-lambda-powertools/metrics/middleware'
import { BatchWriteItemCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { EventBridge } from '@aws-sdk/client-eventbridge'
import { IoTDataPlaneClient } from '@aws-sdk/client-iot-data-plane'
import { SSMClient } from '@aws-sdk/client-ssm'
import { marshall } from '@aws-sdk/util-dynamodb'
import { logger } from '@hello.nrfcloud.com/lambda-helpers/logger'
import { metricsForComponent } from '@hello.nrfcloud.com/lambda-helpers/metrics'
import { getLocationHistory } from '@hello.nrfcloud.com/nrfcloud-api-helpers/api'
import { getAllAccountsSettings as getAllNRFCloudAccountSettings } from '@hello.nrfcloud.com/nrfcloud-api-helpers/settings'
import middy from '@middy/core'
import { fromEnv } from '@nordicsemiconductor/from-env'
import type { SQSEvent } from 'aws-lambda'
import { updateLwM2MShadow } from '../../lwm2m/updateLwM2MShadow.js'
import { deviceLwM2MObjectUpdate } from '../eventbus/deviceLwM2MObjectUpdate.js'
import { loggingFetch } from '../loggingFetch.js'
import { toGeoLocation, type LocationHistoryItem } from './toGeoLocation.js'

const { stackName, tableName, EventBusName } = fromEnv({
	stackName: 'STACK_NAME',
	tableName: 'LOCATION_HISTORY_TABLE_NAME',
	EventBusName: 'EVENTBUS_NAME',
})(process.env)

const eventBus = new EventBridge({})
const iotData = new IoTDataPlaneClient({})
const db = new DynamoDBClient({})
const ssm = new SSMClient({})

const notifyWebsocket = deviceLwM2MObjectUpdate(eventBus, EventBusName)

const { track, metrics } = metricsForComponent('fetchLocationHistory')

const allNRFCloudAccountSettings = await getAllNRFCloudAccountSettings({
	ssm,
	stackName,
})

const locationFetcher = new Map<string, ReturnType<typeof getLocationHistory>>()
const log = logger('fetchLocationHistory')
for (const [account, { apiEndpoint, apiKey }] of Object.entries(
	allNRFCloudAccountSettings,
)) {
	locationFetcher.set(
		account,
		getLocationHistory(
			{ endpoint: apiEndpoint, apiKey },
			loggingFetch({ track, log }),
		),
	)
}

const updateShadow = updateLwM2MShadow(iotData)

const h = async (event: SQSEvent): Promise<void> => {
	log.debug('event', event)

	for (const record of event.Records) {
		const { deviceId, from, to, account } = JSON.parse(record.body) as Record<
			string,
			string
		>

		if (
			deviceId === undefined ||
			from === undefined ||
			to === undefined ||
			account === undefined
		) {
			log.error('Missing required attributes')
			track('error', MetricUnit.Count, 1)
			continue
		}
		const fetcher = locationFetcher.get(account)
		if (fetcher === undefined) {
			log.error(`No fetcher defined for ${account}!`)
			track('error', MetricUnit.Count, 1)
			continue
		}
		const locations = await paginateHistory(fetcher, deviceId, from, to)
		track('numLocations', MetricUnit.Count, locations.length)

		// track locations per service
		const countPerSource = locations.reduce<Record<string, number>>(
			(acc, { serviceType }) => ({
				...acc,
				[serviceType]: (acc[serviceType] ?? 0) + 1,
			}),
			{},
		)
		for (const [source, count] of Object.entries(countPerSource)) {
			track(`numLocations:${source}`, MetricUnit.Count, count)
		}
		log.debug('locations', locations)

		// Update the shadow with the latest
		if (locations[0])
			await updateShadow(deviceId, [toGeoLocation(locations[0])])

		// And put all in the table
		const records = locations.map((location) => ({
			PutRequest: {
				Item: marshall(
					{
						id: location.id,
						deviceId,
						timestamp: location.insertedAt,
						lat: parseFloat(location.lat),
						lon: parseFloat(location.lon),
						source: location.serviceType,
						uncertainty: parseFloat(location.uncertainty),
						ttl: Math.round(Date.now() / 1000) + 60 * 60 * 24 * 30,
					},
					{ removeUndefinedValues: true },
				),
			},
		}))
		if (records.length > 0)
			await db.send(
				new BatchWriteItemCommand({
					RequestItems: {
						[tableName]: records,
					},
				}),
			)

		// Put updates on the event bus
		await Promise.all(
			locations.map(async (location) =>
				notifyWebsocket(deviceId, toGeoLocation(location)),
			),
		)
	}
}

const paginateHistory = async (
	client: ReturnType<typeof getLocationHistory>,
	deviceId: string,
	from: string,
	to: string,
	locations: Array<LocationHistoryItem> = [],
	pageNextToken?: string,
): Promise<Array<LocationHistoryItem>> => {
	const maybeLocations = await client({
		deviceId,
		start: new Date(from),
		end: new Date(to),
		pageNextToken,
	})
	if ('error' in maybeLocations) {
		return locations
	}
	const { result } = maybeLocations
	locations.push(...result.items)
	if (maybeLocations.result.pageNextToken !== undefined)
		return paginateHistory(
			client,
			deviceId,
			from,
			to,
			locations,
			maybeLocations.result.pageNextToken,
		)
	return locations
}

export const handler = middy(h).use(logMetrics(metrics))
