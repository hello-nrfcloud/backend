import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createDeviceUpdateChecker } from './deviceShadowUpdateChecker.js'

void describe('deviceShadowUpdateChecker', () => {
	void it('returns true if the device has not been updated in the given interval with no configuration', async () => {
		// Default is 5 seconds
		const deviceShadowUpdateChecker = createDeviceUpdateChecker(new Date())

		const device = {
			model: 'test-model',
			updatedAt: new Date(Date.now() - 6000), // 6 seconds ago
			count: 0,
		}
		const result = deviceShadowUpdateChecker(device)
		assert.equal(result, true)
	})

	void it('returns false if the device has been updated more recently than the given interval with no configuration', async () => {
		// Default is 5 seconds
		const deviceShadowUpdateChecker = createDeviceUpdateChecker(new Date())

		const device = {
			model: 'test-model',
			updatedAt: new Date(Date.now() - 4000), // 4 seconds ago
			count: 0,
		}
		const result = deviceShadowUpdateChecker(device)
		assert.equal(result, false)
	})
})
