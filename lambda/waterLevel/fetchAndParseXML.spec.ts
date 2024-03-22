import { before, describe, it } from 'node:test'
import nock from 'nock'
import assert from 'node:assert'
import path from 'path'
import { readFile } from 'fs/promises'
import parsedApiResponseLocation from './testData/parsedApiResponseLocation.json'
import parsedApiResponseWaterLevel from './testData/parsedApiResponseWaterLevel.json'
import {
	fetchAndParseXML,
	stationInfo,
	waterLevelInfo,
} from './fetchAndParseXML.js'

describe('fetchXML', () => {
	before(async () => {
		const testData = await readFile(
			path.join('lambda/waterLevel/testData', 'responseLocations.xml'),
		)
		const content = testData.toString()
		const waterLevelData = await readFile(
			path.join('lambda/waterLevel/testData', 'responseWaterLevel.xml'),
		)
		const waterLevelcontent = waterLevelData.toString()
		const scope = nock('http://api.sehavniva.no')
		scope
			.get('/tideapi.php?tide_request=stationlist&type=perm')
			.reply(200, content)
		scope
			.get(
				'/tideapi.php?tide_request=locationdata&lat=69.326067&lon=16.134848&datatype=OBS&lang=en&place=&dst=1&refcode=CD&fromtime=2024-03-01T09:00&totime=2024-03-01T11:00&interval=10',
			)
			.reply(200, waterLevelcontent)
	})
	it('it should fetch XML data and parse it for stationInfo', async () => {
		const res = await fetchAndParseXML(
			stationInfo,
			'http://api.sehavniva.no/tideapi.php?tide_request=stationlist&type=perm',
		)
		assert.deepEqual(res, parsedApiResponseLocation)
	})
	it('it should fetch XML data and parse it for water level data from ANX', async () => {
		const res = await fetchAndParseXML(
			waterLevelInfo,
			`http://api.sehavniva.no/tideapi.php?tide_request=locationdata&lat=69.326067&lon=16.134848&datatype=OBS&lang=en&place=&dst=1&refcode=CD&fromtime=2024-03-01T09:00&totime=2024-03-01T11:00&interval=10`,
		)
		assert.deepEqual(res, parsedApiResponseWaterLevel)
	})
})
