import { validateWithTypeBox } from '@hello.nrfcloud.com/proto'
import { parser } from './getWaterLevelInfo.js'
import { Type, type Static, type TObject } from '@sinclair/typebox'

export const fetchAndParseXML = async <Schema extends TObject>(
	schema: Schema,
	url: string,
): Promise<{ value: Static<Schema> } | { error: Error }> => {
	const res = await fetch(url)
	const content = await res.text()
	try {
		const data = await parser.parseStringPromise(content)
		const maybeValidatedData = validateWithTypeBox(schema)(data)
		if ('errors' in maybeValidatedData) {
			console.error(JSON.stringify(maybeValidatedData.errors))
			console.error(`Invalid message`)
			return { error: new Error('Validation of data failed.') }
		}
		return maybeValidatedData
	} catch {
		return { error: new Error('Parsing failed.') }
	}
}

export const stationInfo = Type.Object({
	tide: Type.Object({
		stationinfo: Type.Array(
			Type.Object({
				location: Type.Array(
					Type.Object({
						$: Type.Object({
							name: Type.String({ minLength: 1 }),
							code: Type.String(),
							latitude: Type.Number({ minimum: -180, maximum: 180 }),
							longitude: Type.Number({ minimum: -90, maximum: 90 }),
							type: Type.String(),
						}),
					}),
				),
			}),
		),
	}),
})

export type stationInfoType = Static<typeof stationInfo>

export const waterLevelInfo = Type.Object({
	tide: Type.Object({
		locationdata: Type.Array(
			Type.Object({
				location: Type.Array(
					Type.Object({
						$: Type.Object({
							code: Type.String(),
							latitude: Type.String(),
							longitude: Type.String(),
						}),
					}),
				),
				data: Type.Array(
					Type.Object({
						waterlevel: Type.Array(
							Type.Object({
								$: Type.Object({ value: Type.String(), time: Type.String() }),
							}),
						),
					}),
				),
			}),
		),
	}),
})

export type waterLevelInfoType = Static<typeof waterLevelInfo>
