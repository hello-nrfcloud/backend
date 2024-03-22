import type { Static } from '@sinclair/typebox'
import type { waterLevelInfo } from './fetchAndParseXML'
import type { WaterLevel } from './getWaterLevelInfo'

export const convertWaterLevelsAPIResponse = (
	data: Static<typeof waterLevelInfo>,
): { value: Array<WaterLevel> } | { error: Error } => {
	return { error: new Error('Not implemented!') }
}
