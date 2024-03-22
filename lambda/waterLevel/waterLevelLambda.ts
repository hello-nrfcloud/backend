import { SSMClient } from '@aws-sdk/client-ssm'
import { convertLocationsAPIResponse } from './getLocations'
import { getWaterLevelMeasurements } from './getWaterLevelInfo'
import { waterLevelObjectToLwM2M } from './waterLevelObjectToLwM2M'
import { lwm2mToSenML } from '@hello.nrfcloud.com/proto-lwm2m'
import { validateWithTypeBox } from '@hello.nrfcloud.com/proto'
import { SenML } from '@hello.nrfcloud.com/proto-lwm2m'
import { publishPayload as publishPayload } from './publishPayload'
import stationToDeviceMap from './stationToDeviceMap.json'
import {
	fetchAndParseXML,
	stationInfo,
	waterLevelInfo,
} from './fetchAndParseXML'
import { convertWaterLevelsAPIResponse } from './convertWaterLevelsAPIResponse'
import { getFetchIntervalForAPI } from './getFetchInterval'
export const ssm = new SSMClient({})

const getLocation = async () => {
	const res = await fetchAndParseXML(
		stationInfo,
		'http://api.sehavniva.no/tideapi.php?tide_request=stationlist&type=perm',
	)
	if ('error' in res) {
		console.error(res.error)
		return res
	}
	return convertLocationsAPIResponse(res.value)
}

const isValid = validateWithTypeBox(SenML)
const { from, to } = getFetchIntervalForAPI()
const getWaterLevelForStations = getWaterLevelMeasurements({
	getWaterLevelsForStation: async (station) => {
		const res = await fetchAndParseXML(
			waterLevelInfo,
			`https://api.sehavniva.no/tideapi.php?tide_request=locationdata&lat=${station.location.lat}&lon=${station.location.lng}&datatype=OBS&lang=en&place=&dst=1&refcode=CD&fromtime=${from}&totime=${to}&interval=10`,
		)
		if ('error' in res) {
			console.error(res.error)
			return []
		}
		const converted = convertWaterLevelsAPIResponse(res.value)
		if ('error' in converted) {
			console.error(converted.error)
			return []
		}
		return converted.value
	},
})

export const waterLevelFunction = async (): Promise<void> => {
	const stations = await getLocation()
	console.log(stations)
	if ('error' in stations) {
		return
	}
	const waterLevelMeasurements = await getWaterLevelForStations(stations)
	console.log(waterLevelMeasurements)
	for (const [key, deviceId] of Object.entries(stationToDeviceMap)) {
		const stationObject = waterLevelMeasurements.find((obj) => {
			return obj.station.stationCode === key
		})
		if (stationObject === undefined) {
			return
		}
		const LwM2MObject = waterLevelObjectToLwM2M(stationObject)
		const payload = lwm2mToSenML(LwM2MObject)
		const maybeValidSenML = isValid(payload)
		if ('errors' in maybeValidSenML) {
			console.error(JSON.stringify(maybeValidSenML.errors))
			console.error(`Invalid SenML message`)
			return
		}
		await publishPayload(deviceId, key, maybeValidSenML.value)

		break
	}
}
