import { parser } from './getWaterLevelInfo.js'

export const fetchAndGetStationInfo = async (): Promise<{
	tide: {
		stationinfo: [
			{
				location: {
					$: {
						name: string
						code: string
						latitude: string
						longitude: string
						type: string
					}
				}[]
			},
		]
	}
}> => {
	const res = await fetch(
		'http://api.sehavniva.no/tideapi.php?tide_request=stationlist&type=perm',
	)
	const content = await res.text()
	const data = await parser.parseStringPromise(content)
	return data
}
