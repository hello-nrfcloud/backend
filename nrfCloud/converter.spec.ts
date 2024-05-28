import {
	LwM2MObjectID,
	type Geolocation_14201,
	type LwM2MObjectInstance,
} from '@hello.nrfcloud.com/proto-map/lwm2m'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { converter } from './converter.js'
import GNSS from './examples/GNSS.json'

void describe('convert()', () => {
	void describe('should convert devices messages to LwM2M objects', () => {
		for (const [message, expected] of [
			[
				GNSS,
				<Geolocation_14201>{
					ObjectID: LwM2MObjectID.Geolocation_14201,
					// ObjectInstanceID: 0, // 0: device, 1: ground-fix, 2: single-cell
					ObjectVersion: '1.0',
					Resources: {
						0: 63.43308707524497,
						1: 10.437692463102255,
						3: 4.703136444091797,
						2: 138.33331298828125,
						4: 0.02938256226480007,
						5: 185.11207580566406,
						6: 'GNSS',
						99: GNSS.ts,
					},
				},
			],
		] as [message: Record<string, any>, expected: LwM2MObjectInstance][]) {
			void it(`should convert ${JSON.stringify(message)} to ${JSON.stringify(
				expected,
			)} and validate it`, () => {
				const converted = converter(message)
				assert.deepEqual(converted, expected)
			})
		}
	})
})
