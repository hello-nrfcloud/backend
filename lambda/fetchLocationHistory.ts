import { MetricUnit } from '@aws-lambda-powertools/metrics'
import { logMetrics } from '@aws-lambda-powertools/metrics/middleware'
import { IoTDataPlaneClient } from '@aws-sdk/client-iot-data-plane'
import { SSMClient } from '@aws-sdk/client-ssm'
import {
	TimestreamWriteClient,
	WriteRecordsCommand,
	type _Record,
} from '@aws-sdk/client-timestream-write'
import { metricsForComponent } from '@hello.nrfcloud.com/lambda-helpers/metrics'
import { getLocationHistory } from '@hello.nrfcloud.com/nrfcloud-api-helpers/api'
import { getAllAccountsSettings as getAllNRFCloudAccountSettings } from '@hello.nrfcloud.com/nrfcloud-api-helpers/settings'
import {
	LwM2MObjectID,
	type Geolocation_14201,
	type LwM2MObjectInstance,
} from '@hello.nrfcloud.com/proto-map/lwm2m'
import middy from '@middy/core'
import { fromEnv } from '@nordicsemiconductor/from-env'
import type { SQSEvent } from 'aws-lambda'
import { instanceMeasuresToRecord } from '../historicalData/instanceMeasuresToRecord.js'
import { updateLwM2MShadow } from '../lwm2m/updateLwM2MShadow.js'
import { loggingFetch } from './loggingFetch.js'
import { logger } from '@hello.nrfcloud.com/lambda-helpers/logger'
import { EventBridge } from '@aws-sdk/client-eventbridge'
import { deviceLwM2MObjectUpdate } from './eventbus/deviceLwM2MObjectUpdate.js'

const { stackName, tableInfo, EventBusName } = fromEnv({
	stackName: 'STACK_NAME',
	tableInfo: 'HISTORICAL_DATA_TABLE_INFO',
	EventBusName: 'EVENTBUS_NAME',
})(process.env)
const [DatabaseName, TableName] = tableInfo.split('|')
if (DatabaseName === undefined || TableName === undefined)
	throw new Error('Historical database is invalid')

const eventBus = new EventBridge({})

const notifyWebsocket = deviceLwM2MObjectUpdate(eventBus, EventBusName)

const { track, metrics } = metricsForComponent('fetchLocationHistory')

const ssm = new SSMClient({})

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

const iotData = new IoTDataPlaneClient({})
const updateShadow = updateLwM2MShadow(iotData)

const client = new TimestreamWriteClient({})

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
			(acc, { Resources }) => ({
				...acc,
				[Resources['6']]: (acc[Resources['6']] ?? 0) + 1,
			}),
			{},
		)
		for (const [source, count] of Object.entries(countPerSource)) {
			track(`numLocations:${source}`, MetricUnit.Count, count)
		}
		log.debug('locations', locations)

		const [latestLocation, ...rest] = locations
		console.log('latestLocation', latestLocation)
		console.log('rest', rest)
		// Update the shadow with the latest
		if (latestLocation !== undefined)
			await updateShadow(deviceId, [latestLocation])

		// And put the rest in TimeStream (the first entry will also be persisted in TimeStream by the shadow update handler)
		const Records: _Record[] = []
		for (const {
			ObjectID,
			ObjectInstanceID,
			ObjectVersion,
			Resources,
		} of rest) {
			const maybeRecord = instanceMeasuresToRecord({
				ObjectID,
				ObjectInstanceID,
				ObjectVersion,
				Resources,
			})
			if ('error' in maybeRecord) {
				log.error(maybeRecord.error.message)
				continue
			}
			Records.push(maybeRecord.record)
		}

		if (Records.length > 0) {
			console.debug('records', Records)
			await client.send(
				new WriteRecordsCommand({
					DatabaseName,
					TableName,
					Records,
					CommonAttributes: {
						Dimensions: [
							{
								Name: 'deviceId',
								Value: deviceId,
							},
						],
					},
				}),
			)
		}

		// Put updates on the event bus
		await Promise.all(
			locations.map(async (location) => notifyWebsocket(deviceId, location)),
		)
	}
}

const paginateHistory = async (
	client: ReturnType<typeof getLocationHistory>,
	deviceId: string,
	from: string,
	to: string,
	locations: Array<LwM2MObjectInstance<Geolocation_14201>> = [],
	pageNextToken?: string,
): Promise<Array<LwM2MObjectInstance<Geolocation_14201>>> => {
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
	locations.push(
		...result.items.map((item) => {
			// 0: device, 1: ground-fix, 2: single-cell, 9: other
			let ObjectInstanceID = 9
			if (item.serviceType === 'GNSS') ObjectInstanceID = 0
			if (item.serviceType === 'SCELL') ObjectInstanceID = 2
			if (item.serviceType === 'MCELL') ObjectInstanceID = 1
			if (item.serviceType === 'WIFI') ObjectInstanceID = 1
			const l: LwM2MObjectInstance<Geolocation_14201> = {
				ObjectID: LwM2MObjectID.Geolocation_14201,
				ObjectInstanceID,
				ObjectVersion: '1.0',
				Resources: {
					'0': parseFloat(item.lat),
					'1': parseFloat(item.lon),
					'6': item.serviceType,
					'99': new Date(item.insertedAt).getTime(),
					'3': parseFloat(item.uncertainty),
				},
			}
			return l
		}),
	)
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
