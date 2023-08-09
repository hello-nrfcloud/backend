import { groupBy } from 'lodash-es'

export const transformTimestreamData = (
	data: Record<string, unknown>[],
	mapKeys: { fromKey: string; toKey: string }[],
): Record<string, unknown>[] => {
	const transformedData = []

	// Added ts to mapKeys as default
	mapKeys.push({ fromKey: 'time', toKey: 'ts' })

	const groupedData = groupBy(data, (d) => d.time)
	for (const item in groupedData) {
		const data = groupedData[item]
		const transformedRecord = data?.reduce<Record<string, unknown>>(
			(result, record) => {
				result = {
					...mapKeys.reduce<Record<string, unknown>>(
						(resultMapKeys, mapKey) => {
							if (mapKey.fromKey in record) {
								if (mapKey.fromKey === 'time') {
									resultMapKeys[mapKey.toKey] = (
										record[mapKey.fromKey] as Date
									).getTime()
								} else {
									resultMapKeys[mapKey.toKey] = record[mapKey.fromKey]
								}
							}
							return resultMapKeys
						},
						{},
					),
					...result,
				}
				return result
			},
			{},
		)
		if (transformedRecord !== undefined) transformedData.push(transformedRecord)
	}

	return transformedData
}
