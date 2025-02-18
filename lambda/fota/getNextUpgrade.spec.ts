import { FOTAJobTarget } from '@hello.nrfcloud.com/proto/hello'
import assert from 'node:assert/strict'
import test, { describe, it } from 'node:test'
import { getNextUpgrade } from './getNextUpgrade.ts'

void describe('getNextUpgrade()', () => {
	void it('should return the next upgrade based on a static version', () =>
		assert.deepEqual(
			getNextUpgrade(
				{ '2.0.0': 'APP*1e29dfa3*v2.0.1', '2.0.1': 'APP*cd5412d9*v2.0.2' },
				{
					appVersion: '2.0.0',
					supportedFOTATypes: [FOTAJobTarget.application],
					mfwVersion: '1.3.6',
				},
			),
			{
				upgrade: {
					reportedVersion: '2.0.0',
					bundleId: 'APP*1e29dfa3*v2.0.1',
					target: FOTAJobTarget.application,
				},
			},
		))

	void describe('should return the next upgrade based on a range', () => {
		for (const range of ['>=1.0.0', '<2.0.1']) {
			void test(range, () =>
				assert.deepEqual(
					getNextUpgrade(
						{ [range]: 'APP*1e29dfa3*v2.0.1' },
						{
							appVersion: '2.0.0',
							supportedFOTATypes: [FOTAJobTarget.application],
							mfwVersion: '1.3.6',
						},
					),
					{
						upgrade: {
							reportedVersion: '2.0.0',
							bundleId: 'APP*1e29dfa3*v2.0.1',
							target: FOTAJobTarget.application,
						},
					},
				),
			)
		}
	})

	void it('should return null in case of no upgrade', () =>
		assert.deepEqual(
			getNextUpgrade(
				{ '<2.0.1': 'APP*1e29dfa3*v2.0.1' },
				{
					appVersion: '2.0.1',
					supportedFOTATypes: [FOTAJobTarget.application],
					mfwVersion: '1.3.6',
				},
			),
			{
				upgrade: {
					reportedVersion: '2.0.1',
					bundleId: null,
					target: FOTAJobTarget.application,
				},
			},
		))
})
