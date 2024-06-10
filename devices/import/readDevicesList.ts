import { isFingerprint } from '@hello.nrfcloud.com/proto/fingerprint'
import { readFile } from 'node:fs/promises'
import { isIMEI } from '../isIMEI.js'

export const readDevicesList = async (
	devicesListPath: string,
	model: string,
	lineEnds = '\r\n', // windows
): Promise<Map<string, { fingerprint: string }>> =>
	(await readFile(devicesListPath, 'utf-8'))
		.trim()
		.split(lineEnds)
		.map((s) => s.split(','))
		.slice(1)
		.map(([, deviceModel, , IMEI, , fingerprint, ,], n) => {
			if (!isFingerprint(fingerprint))
				throw new Error(`Invalid fingerprint: ${fingerprint} in line ${n}!`)
			if (!isIMEI(IMEI)) throw new Error(`Invalid IMEI: ${IMEI} in line ${n}!`)
			if (deviceModel !== model)
				throw new Error(`Invalid model: ${deviceModel} in line ${n}!`)
			return {
				IMEI,
				fingerprint,
			}
		})
		.reduce<Map<string, { fingerprint: string }>>((acc, device) => {
			if (acc.has(device.IMEI)) {
				throw new Error(`Duplicate IMEI: ${device.IMEI}!`)
			}
			acc.set(device.IMEI, {
				fingerprint: device.fingerprint,
			})
			return acc
		}, new Map())
