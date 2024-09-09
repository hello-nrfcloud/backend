import assert from 'node:assert/strict'
import path from 'node:path'
import { describe, it } from 'node:test'
import { readDevicesList } from './readDevicesList.js'

void describe('readDevicesList()', () => {
	void it('should return a map of certificates', async () => {
		const certs = await readDevicesList(
			path.join(process.cwd(), 'devices', 'import', 'testdata', 'test.csv'),
			'PCA20065',
		)

		assert.deepEqual(
			certs,
			new Map([
				[
					'355066600000001',
					{
						fingerprint: '974.test42',
						hwVersion: '0.7.0',
					},
				],
				[
					'355066600000002',
					{
						fingerprint: '971.test43',
						hwVersion: '0.7.0',
					},
				],
				[
					'355066600000003',
					{
						fingerprint: '971.test44',
						hwVersion: '0.7.0',
					},
				],
			]),
		)
	})
})
