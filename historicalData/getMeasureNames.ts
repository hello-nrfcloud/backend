import { type HistoricalRequest } from './historicalDataRepository.js'

export const getMeasureNames = (
	attributes: HistoricalRequest['attributes'],
): string[] => {
	const aggs: string[] = []
	for (const prop in attributes) {
		const attribute = attributes[prop as keyof typeof attributes]
		if (!('aggregate' in attribute)) {
			aggs.push(`${attribute.attribute}`)
		}
	}

	return aggs
}
