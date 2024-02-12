import { describe, it } from 'node:test'
import { objectMatching, check, arrayMatching } from 'tsmatchers'

const onlyDefined = (from: Record<string, any>, to: Record<string, any>) =>
	Object.entries(from).reduce((toCheck, [k]) => {
		let v = (to as Record<string, any>)[k]
		if (Array.isArray(v)) v = arrayMatching(onlyDefined(from[k], v))
		return {
			...toCheck,
			[k]: v,
		}
	}, {})

const deepMatch = (expected: unknown, actual: unknown): void => {
	if (typeof expected === 'object' && expected !== null) {
		const checkWithOutUndefinedKeys = onlyDefined(
			expected,
			actual as Record<string, any>,
		)
		check(checkWithOutUndefinedKeys).is(objectMatching(expected))
		return
	}
	check(actual).is(expected as any)
}

void describe('deepMatch()', () => {
	it('should deep match an object', () =>
		deepMatch(
			{
				'@context':
					'https://github.com/hello-nrfcloud/proto/historical-data-response',
				'@id': '46156b60-529d-473a-96d7-97cdc9d2cdbc',
				type: 'lastHour',
				message: 'locationTrail',
				attributes: [
					{
						lat: 63.42198706744704,
						lng: 10.437808861037931,
						ts: 1707755765564,
						count: 4,
						radiusKm: 0.2937028058347316,
					},
					{
						lat: 63.43076160883743,
						lng: 10.487144544169565,
						ts: 1707755769564,
						count: 1,
						radiusKm: 0,
					},
					{
						lat: 63.42215444775618,
						lng: 10.535387671151794,
						ts: 1707755770564,
						count: 1,
						radiusKm: 0,
					},
					{
						lat: 63.42254450323275,
						lng: 10.630926224360818,
						ts: 1707755771564,
						count: 1,
						radiusKm: 0,
					},
				],
			},
			{
				'@context':
					'https://github.com/hello-nrfcloud/proto/historical-data-response',
				'@id': '46156b60-529d-473a-96d7-97cdc9d2cdbc',
				attributes: [
					{
						lng: 10.437808861037931,
						ts: 1707755765564,
						acc: 20,
						lat: 63.42198706744704,
						count: 4,
						radiusKm: 0.2937028058347316,
					},
					{
						lat: 63.43076160883743,
						ts: 1707755769564,
						lng: 10.487144544169565,
						acc: 20,
						count: 1,
						radiusKm: 0,
					},
					{
						lat: 63.42215444775618,
						ts: 1707755770564,
						lng: 10.535387671151794,
						acc: 20,
						count: 1,
						radiusKm: 0,
					},
					{
						lng: 10.630926224360818,
						ts: 1707755771564,
						acc: 20,
						lat: 63.42254450323275,
						count: 1,
						radiusKm: 0,
					},
				],
				type: 'lastHour',
				message: 'locationTrail',
			},
		))
})
