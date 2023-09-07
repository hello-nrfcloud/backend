import { calculateCosts } from './calculateCosts.js'

const testDateAugust = 1691145383000

describe('CalculateCosts()', () => {
	it('should return the minimum fee if no usage', () => {
		const expected = 1.99

		const dataNoCost = {
			currentDevices: {
				total: 0,
				bluetoothLE: 0,
				gateway: 0,
				generic: 9,
			},
			services: [
				{
					date: '2023-08',
					fotaJobExecutions: 0,
					storedDeviceMessages: 0,
					locationServices: {
						AGPS: {
							requests: 0,
							devicesUsing: 0,
						},
						PGPS: {
							requests: 0,
							devicesUsing: 0,
						},
						SCELL: {
							requests: 0,
							devicesUsing: 0,
						},
						MCELL: {
							requests: 0,
							devicesUsing: 0,
						},
						WIFI: {
							requests: 0,
							devicesUsing: 0,
						},
					},
				},
			],
		}
		expect(calculateCosts(dataNoCost, testDateAugust)).toBe(expected)
	})

	it('should calculate the costs per month for nRF Cloud', () => {
		const expected = 40.15
		const data = {
			currentDevices: {
				total: 9,
				bluetoothLE: 0,
				gateway: 0,
				generic: 9,
			},
			services: [
				{
					date: '2023-08',
					fotaJobExecutions: 0,
					storedDeviceMessages: 120124,
					locationServices: {
						AGPS: {
							requests: 120,
							devicesUsing: 2,
						},
						PGPS: {
							requests: 0,
							devicesUsing: 0,
						},
						SCELL: {
							requests: 13241,
							devicesUsing: 171,
						},
						MCELL: {
							requests: 6939,
							devicesUsing: 1,
						},
						WIFI: {
							requests: 0,
							devicesUsing: 0,
						},
					},
				},
				{
					date: '2023-07',
					fotaJobExecutions: 2,
					storedDeviceMessages: 613277,
					locationServices: {
						AGPS: {
							requests: 42,
							devicesUsing: 2,
						},
						PGPS: {
							requests: 0,
							devicesUsing: 0,
						},
						SCELL: {
							requests: 10039,
							devicesUsing: 56,
						},
						MCELL: {
							requests: 75486,
							devicesUsing: 2,
						},
						WIFI: {
							requests: 0,
							devicesUsing: 0,
						},
					},
				},
			],
		}

		expect(calculateCosts(data, testDateAugust)).toBe(expected)
	})

	it('should return minimum costs if monthly usage is below 1.99 ', () => {
		const expected = 1.99
		const dataLowCost = {
			currentDevices: {
				total: 9,
				bluetoothLE: 0,
				gateway: 0,
				generic: 9,
			},
			services: [
				{
					date: '2023-08',
					fotaJobExecutions: 0,
					storedDeviceMessages: 0,
					locationServices: {
						AGPS: {
							requests: 42,
							devicesUsing: 2,
						},
						PGPS: {
							requests: 0,
							devicesUsing: 0,
						},
						SCELL: {
							requests: 0,
							devicesUsing: 0,
						},
						MCELL: {
							requests: 0,
							devicesUsing: 0,
						},
						WIFI: {
							requests: 0,
							devicesUsing: 0,
						},
					},
				},
			],
		}

		expect(calculateCosts(dataLowCost, testDateAugust)).toBe(expected)
	})
})
