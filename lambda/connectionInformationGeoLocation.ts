import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { EventBridge } from '@aws-sdk/client-eventbridge'
import { IoTDataPlaneClient } from '@aws-sdk/client-iot-data-plane'
import { SSMClient } from '@aws-sdk/client-ssm'
import {
	ValidationError,
	groundFix,
	serviceToken,
} from '@hello.nrfcloud.com/nrfcloud-api-helpers/api'
import {
	get,
	store,
	type cellId,
} from '@hello.nrfcloud.com/nrfcloud-api-helpers/cellGeoLocation'
import { getSettings } from '@hello.nrfcloud.com/nrfcloud-api-helpers/settings'
import {
	LwM2MObjectID,
	type ConnectionInformation_14203,
	type Geolocation_14201,
	type LwM2MObjectInstance,
} from '@hello.nrfcloud.com/proto-map/lwm2m'
import { Context } from '@hello.nrfcloud.com/proto/hello'
import { fromEnv } from '@nordicsemiconductor/from-env'
import { once } from 'lodash-es'
import { updateLwM2MShadow } from '../lwm2m/updateLwM2MShadow.js'
import { NRF_CLOUD_ACCOUNT } from '../settings/account.js'
import type { WebsocketPayload } from './publishToWebsocketClients.js'

const { TableName, stackName, EventBusName } = fromEnv({
	TableName: 'CACHE_TABLE_NAME',
	stackName: 'STACK_NAME',
	EventBusName: 'EVENTBUS_NAME',
})(process.env)

const db = new DynamoDBClient({})
const ssm = new SSMClient({})

const getCached = get({
	db,
	TableName,
})
const cache = store({
	db,
	TableName,
})

const eventBus = new EventBridge({})

const updateShadow = updateLwM2MShadow(new IoTDataPlaneClient({}))
const apiSettings = once(
	getSettings({ ssm, stackName, account: NRF_CLOUD_ACCOUNT }),
)
const fetchToken = once(async (args: Parameters<typeof serviceToken>[0]) =>
	serviceToken(args)(),
)

export const handler = async (event: {
	connectionInformation: ConnectionInformation_14203['Resources']
	id: string // e.g. '4872a392-3457-4761-9ee0-418971b0db09'
}): Promise<void> => {
	console.log(JSON.stringify(event))

	const { 5: mccmnc, 4: cell, 3: area, 2: rsrp } = event.connectionInformation

	if (mccmnc === undefined || cell === undefined || area === undefined) {
		console.debug('Not all required values are set.')
		return
	}

	const key: Parameters<typeof cellId>[0] = {
		mccmnc,
		area,
		cell,
	}

	// Get from cache
	let geoLocation = await getCached(key)

	// Resolve using nRF Cloud API
	if (geoLocation === null) {
		const { apiEndpoint, apiKey } = await apiSettings()
		const locationServiceToken = await fetchToken({
			endpoint: apiEndpoint,
			apiKey,
		})

		if ('error' in locationServiceToken) {
			if (locationServiceToken.error instanceof ValidationError) {
				console.error(JSON.stringify(locationServiceToken.error.errors))
			} else {
				console.error(locationServiceToken.error.message)
			}
			throw new Error(`Acquiring service token failed.`)
		}

		const fetchLocation = groundFix({
			apiKey: locationServiceToken.token,
			endpoint: apiEndpoint,
		})

		const maybeResult = await fetchLocation({
			mcc: parseInt(mccmnc.toString().slice(0, -2), 10),
			mnc: mccmnc.toString().slice(-2),
			eci: cell,
			tac: area,
			rsrp,
		})

		if ('error' in maybeResult) {
			console.error('Failed to resolve cell location:', {
				error: maybeResult.error,
			})
		} else {
			const { lat, lon, uncertainty } = maybeResult.result
			geoLocation = {
				lat,
				lng: lon,
				accuracy: uncertainty,
			}
			await cache(key, geoLocation)
		}
	}

	// Write to shadow
	if (geoLocation !== null) {
		console.log(JSON.stringify(geoLocation))
		const singleCellGeoLocation: Geolocation_14201 & LwM2MObjectInstance = {
			ObjectID: LwM2MObjectID.Geolocation_14201,
			ObjectVersion: '1.0',
			ObjectInstanceID: 2, // 0: device, 1: ground-fix, 2: single-cell
			Resources: {
				0: geoLocation.lat,
				1: geoLocation.lng,
				3: geoLocation.accuracy,
				6: 'SCELL',
				99: event.connectionInformation[99],
			},
		}
		await updateShadow(event.id, [singleCellGeoLocation])

		await eventBus.putEvents({
			Entries: [
				{
					EventBusName,
					Source: 'hello.ws',
					DetailType: Context.lwm2mObjectUpdate.toString(),
					Detail: JSON.stringify(<WebsocketPayload>{
						deviceId: event.id,
						message: {
							'@context': Context.lwm2mObjectUpdate.toString(),
							...singleCellGeoLocation,
						},
					}),
				},
			],
		})
	}
}
