import { isFingerprint } from '@hello.nrfcloud.com/proto/fingerprint'
import { readFile } from 'node:fs/promises'
import { isIMEI } from '../isIMEI.js'

export const readDevicesList = async (
	devicesListPath: string,
	model: string,
	lineEnds = '\n', // linux
): Promise<Map<string, { fingerprint: string; hwVersion: string }>> =>
	(await readFile(devicesListPath, 'utf-8'))
		.trim()
		.split(lineEnds)
		.map((s) => s.split(','))
		.slice(1)
		.map(([, deviceModel, hwVersion, IMEI, , fingerprint, ,], n) => {
			if (!isFingerprint(fingerprint))
				throw new Error(`Invalid fingerprint: ${fingerprint} in line ${n}!`)
			if (!isIMEI(IMEI)) throw new Error(`Invalid IMEI: ${IMEI} in line ${n}!`)
			if (deviceModel !== model)
				throw new Error(`Invalid model: ${deviceModel} in line ${n}!`)
			if (hwVersion === undefined)
				throw new Error(`Missing hwVersion in line ${n}!`)
			return {
				IMEI,
				fingerprint,
				hwVersion,
			}
		})
		.reduce<Map<string, { fingerprint: string; hwVersion: string }>>(
			(acc, device) => {
				if (acc.has(device.IMEI)) {
					throw new Error(`Duplicate IMEI: ${device.IMEI}!`)
				}
				acc.set(device.IMEI, {
					fingerprint: device.fingerprint,
					hwVersion: device.hwVersion,
				})
				return acc
			},
			new Map(),
		)
