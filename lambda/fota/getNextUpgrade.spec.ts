import { FOTAJobTarget } from '@hello.nrfcloud.com/proto/hello'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { getNextUpgrade } from './getNextUpgrade.js'

void describe('getNextUpgrade()', () => {
	void it('should return the next upgrade based on a static version', () =>
		assert.deepEqual(
			getNextUpgrade(
				{
					'2.0.0': 'APP*1e29dfa3*v2.0.1',
					'2.0.1': 'APP*cd5412d9*v2.0.2',
				},
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

	void it('should return the next upgrade based on a range', () =>
		assert.deepEqual(
			getNextUpgrade(
				{
					'>=1.0.0': 'APP*1e29dfa3*v2.0.1',
				},
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
})
