import type { IoTDataPlaneClient } from '@aws-sdk/client-iot-data-plane'
import {
	LwM2MObjectID,
	type DeviceInformation_14204,
	type NRFCloudServiceInfo_14401,
} from '@hello.nrfcloud.com/proto-map/lwm2m'
import { FOTAJobTarget } from '@hello.nrfcloud.com/proto/hello'
import { isObject } from 'lodash-es'
import semver from 'semver'
import { getLwM2MShadow } from '../../lwm2m/getLwM2MShadow.js'

export type DeviceFirmwareDetails = {
	appVersion: string | undefined
	mfwVersion: string | undefined
	supportedFOTATypes: Array<FOTAJobTarget>
}

export const getDeviceFirmwareDetails = (
	iotData: IoTDataPlaneClient,
): ((deviceId: string) => Promise<
	| { error: Error }
	| {
			details: DeviceFirmwareDetails
	  }
>) => {
	const getShadow = getLwM2MShadow(iotData)
	return async (deviceId: string) => {
		const maybeShadow = await getShadow({
			id: deviceId,
		})
		if ('error' in maybeShadow) {
			return {
				error: new Error(`Unknown device state: ${maybeShadow.error.message}!`),
			}
		}

		const supportedFOTATypes = (
			maybeShadow.shadow.reported.find(isNRFCloudServiceInfo)?.Resources[0] ??
			[]
		)
			.map((s) => {
				switch (s) {
					case 'APP':
						return FOTAJobTarget.application
					case 'MODEM':
					case 'MDM_FULL':
						return FOTAJobTarget.modem
					default:
						return
				}
			})
			.filter((s): s is FOTAJobTarget => s !== null)
		const appVersion =
			maybeShadow.shadow.reported.find(isDeviceInfo)?.Resources[3]
		const mfwVersion =
			maybeShadow.shadow.reported.find(isDeviceInfo)?.Resources[2]

		if (supportedFOTATypes.length === 0) {
			return {
				error: new Error(`This device does not support FOTA!`),
			}
		}

		return {
			details: {
				appVersion:
					appVersion !== undefined ? toVersion(appVersion) : undefined,
				mfwVersion:
					mfwVersion !== undefined ? toVersion(mfwVersion) : undefined,
				supportedFOTATypes,
			},
		}
	}
}

const toVersion = (version: string): string => {
	const { major, minor, patch } = semver.parse(version) ?? {}
	return `${major ?? 0}.${minor ?? 0}.${patch ?? 0}`
}

export const isNRFCloudServiceInfo = (
	instance: unknown,
): instance is NRFCloudServiceInfo_14401 =>
	isObject(instance) &&
	'ObjectID' in instance &&
	instance.ObjectID === LwM2MObjectID.NRFCloudServiceInfo_14401

export const isDeviceInfo = (
	instance: unknown,
): instance is DeviceInformation_14204 =>
	isObject(instance) &&
	'ObjectID' in instance &&
	instance.ObjectID === LwM2MObjectID.DeviceInformation_14204
