import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { hashSHA1 } from '../util/hashSHA1.js'
import {
	createDeviceUpdateChecker,
	parseConfig,
} from './deviceShadowUpdateChecker.js'

const hashConfig = (config: {
	[key: string]: string
}): { [key: string]: string } =>
	Object.entries(config).reduce(
		(result, [k, v]) => {
			if (k !== 'default') {
				k = hashSHA1(k)
			}
			result[k] = v
			return result
		},
		{} as { [key: string]: string },
	)

void describe('parseConfig', () => {
	void it('should parse a valid configuration object', () => {
		const config = {
			default: '5',
			Model1: '5:10, 15: 20 , 20 ',
			Model2: '5:10',
		}

		const expectedScheduleConfig = {
			default: [{ count: Number.MAX_SAFE_INTEGER, interval: 5 }],
			Model1: [
				{ count: 10, interval: 5 },
				{ count: 30, interval: 15 },
				{ count: Number.MAX_SAFE_INTEGER, interval: 20 },
			],
			Model2: [{ count: Number.MAX_SAFE_INTEGER, interval: 5 }],
		}

		const parsedConfig = parseConfig(config)
		assert.deepEqual(parsedConfig, expectedScheduleConfig)
	})

	void it('should handle invalid format or empty values in the configuration object', () => {
		const config = {
			default: '20, 30:5, 10',
			Model1: 'wrong format',
			Model2: '',
		}

		const expectedScheduleConfig = {
			default: [
				{ count: Number.MAX_SAFE_INTEGER, interval: 10 },
				{ count: Number.MAX_SAFE_INTEGER, interval: 20 },
				{ count: Number.MAX_SAFE_INTEGER, interval: 30 },
			],
			Model1: [],
			Model2: [],
		}

		const parsedConfig = parseConfig(config)

		assert.deepEqual(parsedConfig, expectedScheduleConfig)
	})

	void it('should have convert the maximum interval count to maximum number', () => {
		const config = {
			default: '5:2',
			Model1: '15:3, 10:2, 5:1',
		}

		const expectedScheduleConfig = {
			default: [{ count: Number.MAX_SAFE_INTEGER, interval: 5 }],
			Model1: [
				{ count: 1, interval: 5 },
				{ count: 3, interval: 10 },
				{ count: Number.MAX_SAFE_INTEGER, interval: 15 },
			],
		}

		const parsedConfig = parseConfig(config)

		assert.deepEqual(parsedConfig, expectedScheduleConfig)
	})
})

void describe('deviceShadowUpdateChecker', () => {
	void it('returns true if the device has not been updated in the given interval with no configuration', async () => {
		// Default is 5 seconds
		const deviceShadowUpdateChecker = await createDeviceUpdateChecker(
			new Date(),
			{},
		)

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
		const deviceShadowUpdateChecker = await createDeviceUpdateChecker(
			new Date(),
			{},
		)

		const device = {
			model: 'test-model',
			updatedAt: new Date(Date.now() - 4000), // 4 seconds ago
			count: 0,
		}
		const result = deviceShadowUpdateChecker(device)
		assert.equal(result, false)
	})

	void it('uses the default configuration interval if no model-specific configuration is available', async () => {
		const deviceShadowUpdateChecker = await createDeviceUpdateChecker(
			new Date(),
			parseConfig(
				hashConfig({
					'test-model': '4',
					default: '6:10',
				}),
			),
		)

		const device = {
			model: 'unknown-model',
			updatedAt: new Date(Date.now() - 6000), // 6 seconds ago
			count: 1,
		}
		const result = deviceShadowUpdateChecker(device)
		assert.equal(result, true)
	})

	void it('uses the default configuration maximum interval if no model-specific configuration is available and count exceeds the limit', async () => {
		const deviceShadowUpdateChecker = await createDeviceUpdateChecker(
			new Date(),
			parseConfig(
				hashConfig({
					'test-model': '20',
					default: '2:10, 6:15',
				}),
			),
		)

		const device = {
			model: 'unknown-model',
			updatedAt: new Date(Date.now() - 6000), // 6 seconds ago
			count: 20,
		}
		const result = deviceShadowUpdateChecker(device)
		assert.equal(result, true)
	})

	void it('uses the correct interval for the device model', async () => {
		const deviceShadowUpdateChecker = await createDeviceUpdateChecker(
			new Date(),
			parseConfig(
				hashConfig({
					'test-model': '4',
					default: '6:10',
				}),
			),
		)

		const device = {
			model: 'test-model',
			updatedAt: new Date(Date.now() - 4000), // 4 seconds ago
			count: 3,
		}
		const result = deviceShadowUpdateChecker(device)
		assert.equal(result, true)
	})

	void it('uses the correct interval for the device count', async () => {
		const deviceShadowUpdateChecker = await createDeviceUpdateChecker(
			new Date(),
			parseConfig(
				hashConfig({
					'test-model': '1:2, 6:10',
				}),
			),
		)

		const device = {
			model: 'test-model',
			updatedAt: new Date(Date.now() - 6000), // 6 seconds ago
			count: 3,
		}
		const result = deviceShadowUpdateChecker(device)
		assert.equal(result, true)
	})

	void it('uses the default configuration interval for the device if no configuration is matched', async () => {
		const deviceShadowUpdateChecker = await createDeviceUpdateChecker(
			new Date(),
			parseConfig(
				hashConfig({
					default: '6',
				}),
			),
		)

		const device1 = {
			model: 'test-model1',
			updatedAt: new Date(Date.now() - 6000), // 6 seconds ago
			count: 3,
		}
		const device2 = {
			model: 'test-model2',
			updatedAt: new Date(Date.now() - 4000), // 4 seconds ago
			count: 3,
		}

		const result1 = deviceShadowUpdateChecker(device1)
		assert.equal(result1, true)

		const result2 = deviceShadowUpdateChecker(device2)
		assert.equal(result2, false)
	})
})
