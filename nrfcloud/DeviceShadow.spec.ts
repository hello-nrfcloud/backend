import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { validateWithTypeBox } from '@hello.nrfcloud.com/proto'
import { DeviceShadow } from './DeviceShadow.js'

void describe('DeviceShadow type', () => {
	void it('should document the device shadow object', () => {
		const res = validateWithTypeBox(DeviceShadow)({
			id: 'some-device',
			state: {
				version: 42,
				reported: {
					dev: {
						v: {
							imei: '358299840016535',
							iccid: '89450421180216254864',
							modV: 'mfw_nrf91x1_2.0.0-77.beta',
							brdV: 'thingy91x_nrf9161',
							appV: '0.0.0-development',
						},
						ts: 1697102116821,
					},
				},
				metadata: {
					reported: {
						dev: {
							v: {
								imei: {
									timestamp: 1697102122,
								},
								iccid: {
									timestamp: 1697102122,
								},
								modV: {
									timestamp: 1697102122,
								},
								brdV: {
									timestamp: 1697102122,
								},
								appV: {
									timestamp: 1697102122,
								},
							},
							ts: {
								timestamp: 1697102122,
							},
						},
					},
				},
			},
		})
		assert.equal('errors' in res, false)
	})
})
