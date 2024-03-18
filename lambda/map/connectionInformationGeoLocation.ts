import {
	LwM2MObjectID,
	type ConnectionInformation_14203,
	type Geolocation_14201,
	type LwM2MObjectInstance,
} from '@hello.nrfcloud.com/proto-map'
import { cellId } from '../../cellGeoLocation/cellId.js'
import { fromEnv } from '@nordicsemiconductor/from-env'
import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { get, store } from '../../cellGeoLocation/SingleCellGeoLocationCache.js'
import { IoTDataPlaneClient } from '@aws-sdk/client-iot-data-plane'
import { updateLwM2MShadow } from './updateLwM2MShadow.js'
import { JSONPayload, validatedFetch } from '../../nrfcloud/validatedFetch.js'
import { once } from 'lodash-es'
import { getSettings } from '../../nrfcloud/settings.js'
import { SSMClient } from '@aws-sdk/client-ssm'
import { serviceToken } from '../nrfcloud/serviceToken.js'
import { GroundFix } from '../nrfcloud/groundFix.js'

const { TableName, backendStackName } = fromEnv({
	TableName: 'CACHE_TABLE_NAME',
	backendStackName: 'BACKEND_STACK_NAME',
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

const updateShadow = updateLwM2MShadow(new IoTDataPlaneClient({}))
const apiSettings = once(
	getSettings({ ssm, stackName: backendStackName, account: 'nordic' }),
)
const fetchToken = serviceToken()

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
		const body = {
			lte: [
				{
					mcc: parseInt(mccmnc.toString().slice(0, -2), 10),
					mnc: mccmnc.toString().slice(-2),
					eci: cell,
					tac: area,
					rsrp,
				},
			],
		}

		const { apiEndpoint, apiKey } = await apiSettings()
		const locationServiceToken = await fetchToken({ apiEndpoint, apiKey })

		const vf = validatedFetch({
			endpoint: apiEndpoint,
			apiKey: locationServiceToken,
		})
		const maybeResult = await vf(
			{ resource: 'location/ground-fix', payload: JSONPayload(body) },
			GroundFix,
		)

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
	}
}
