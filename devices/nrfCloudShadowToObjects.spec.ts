import {
	LwM2MObjectID,
	type ConnectionInformation_14203,
	type DeviceInformation_14204,
} from '@hello.nrfcloud.com/proto-map/lwm2m'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { nrfCloudShadowToObjects } from './nrfCloudShadowToObjects.js'

const deviceInfo: DeviceInformation_14204 = {
	ObjectID: LwM2MObjectID.DeviceInformation_14204,
	ObjectVersion: '1.0',
	Resources: {
		// IMEI
		0: '355025930003908',
		// Modem firmware version
		2: 'mfw_nrf91x1_2.0.1',
		// Application firmware version
		3: 'N/A',
		// Board version
		4: 'thingy91x',
		// Timestamp
		99: new Date(1716560679 * 1000),
		// SIM ICCID
		1: '89470060200703359994',
	},
}

const connectionInfo: ConnectionInformation_14203 = {
	ObjectID: LwM2MObjectID.ConnectionInformation_14203,
	ObjectVersion: '1.0',
	Resources: {
		// Timestamp
		99: new Date(1716560679 * 1000),
		// Network mode
		0: 'LTE-M GPS',
		// Band
		1: 20,
		// RSRP (dBm), FIXME: not supported yet: https://github.com/hello-nrfcloud/firmware/issues/105
		// 2: number;
		// Area
		3: 33131,
		// Cell
		4: 51297540,
		// Mobile country code and mobile network code
		5: 24201,
		// IP address
		6: '10.108.72.99',
		// Energy Estimate, FIXME: not supported yet: https://github.com/hello-nrfcloud/firmware/issues/105
		// 11: number;
	},
}

void describe('nrfCloudShadowToObjects()', () => {
	void it('should convert the device information stored in the nRF Cloud shadow to LwM2M objects', () =>
		assert.deepEqual(
			nrfCloudShadowToObjects({
				id: 'oob-355025930003908',
				$meta: {
					updatedAt: '2024-05-27T09:28:05.855Z',
					createdAt: '2024-05-25T12:56:57.737Z',
				},
				state: {
					reported: {
						device: {
							deviceInfo: {
								modemFirmware: 'mfw_nrf91x1_2.0.1',
								batteryVoltage: 5101,
								imei: '355025930003908',
								board: 'thingy91x',
								sdkVer: 'v2.6.99-cs1-339-g5cc5862dad1e',
								appName: 'N/A',
								zephyrVer: 'v3.5.99-ncs1-7471-g25fbeabe9004',
								hwVer: 'nRF9151 LACA ADA',
							},
							networkInfo: {
								currentBand: 20,
								supportedBands: '(1,2,3,4,5,8,12,13,18,19,20,25,26,28,66,85)',
								areaCode: 33131,
								mccmnc: '24201',
								ipAddress: '10.108.72.99',
								ueMode: 2,
								cellID: 51297540,
								networkMode: 'LTE-M GPS',
							},
							simInfo: {
								uiccMode: 0,
								iccid: '89470060200703359994',
								imsi: '242016000941158',
							},
							connectionInfo: { protocol: 'CoAP', method: 'LTE' },
						},
					},
					metadata: {
						reported: {
							device: {
								deviceInfo: {
									modemFirmware: { timestamp: 1716560679 },
									batteryVoltage: { timestamp: 1716560679 },
									imei: { timestamp: 1716560679 },
									board: { timestamp: 1716560679 },
									sdkVer: { timestamp: 1716560679 },
									appName: { timestamp: 1716560679 },
									zephyrVer: { timestamp: 1716560679 },
									hwVer: { timestamp: 1716560679 },
								},
								networkInfo: {
									currentBand: { timestamp: 1716560679 },
									supportedBands: { timestamp: 1716560679 },
									areaCode: { timestamp: 1716560679 },
									mccmnc: { timestamp: 1716560679 },
									ipAddress: { timestamp: 1716560679 },
									ueMode: { timestamp: 1716560679 },
									cellID: { timestamp: 1716560679 },
									networkMode: { timestamp: 1716560679 },
								},
								simInfo: {
									uiccMode: { timestamp: 1716560679 },
									iccid: { timestamp: 1716560679 },
									imsi: { timestamp: 1716560679 },
								},
								connectionInfo: {
									protocol: { timestamp: 1716560679 },
									method: { timestamp: 1716560679 },
								},
								serviceInfo: {},
							},
						},
					},
					version: 72,
				},
			}),
			[deviceInfo, connectionInfo],
		))
})
