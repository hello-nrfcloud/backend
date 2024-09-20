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

type VersionInfo =
	| {
			appVersion: string
	  }
	| {
			mfwVersion: string
	  }
	| {
			appVersion: string
			mfwVersion: string
	  }

export type DeviceFirmwareDetails = {
	appVersion: string | undefined
	mfwVersion: string | undefined
	supportedFOTATypes: Array<FOTAJobTarget>
} & VersionInfo

export const getDeviceFirmwareDetails = (
	iotData: IoTDataPlaneClient,
): ((
	deviceId: string,
	debug?: (...args: Array<unknown>) => void,
) => Promise<
	| { error: Error }
	| {
			details: DeviceFirmwareDetails
	  }
>) => {
	const getShadow = getLwM2MShadow(iotData)
	return async (deviceId: string, debug) => {
		const maybeShadow = await getShadow({
			id: deviceId,
		})
		if ('error' in maybeShadow) {
			return {
				error: new Error(`Unknown device state: ${maybeShadow.error.message}!`),
			}
		}

		debug?.({ shadow: maybeShadow.shadow.reported })

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
						return null
				}
			})
			.filter((s): s is FOTAJobTarget => s !== null)

		debug?.({ supportedFOTATypes })

		if (supportedFOTATypes.length === 0) {
			return {
				error: new Error(`This device does not support FOTA!`),
			}
		}

		const appVersion =
			maybeShadow.shadow.reported.find(isDeviceInfo)?.Resources[3]
		const mfwVersion =
			maybeShadow.shadow.reported.find(isDeviceInfo)?.Resources[2]

		debug?.({ appVersion, mfwVersion })

		const versions = {
			appVersion: toVersion(appVersion),
			mfwVersion: toVersion(mfwVersion?.split('_')?.pop()),
		}

		debug?.({ versions })

		if (!isVersionInfo(versions)) {
			return {
				error: new Error(`This device has not reported any firmware versions!`),
			}
		}

		return {
			details: {
				...versions,
				supportedFOTATypes,
			},
		}
	}
}

const isVersionInfo = (v: unknown): v is VersionInfo =>
	v !== null &&
	typeof v === 'object' &&
	(('appVersion' in v && typeof v.appVersion === 'string') ||
		('mfwVersion' in v && typeof v.mfwVersion === 'string'))

const toVersion = (version?: string): string | undefined => {
	if (version === undefined) return undefined
	const { major, minor, patch } = semver.parse(version) ?? {}
	if (major === undefined || minor === undefined || patch === undefined)
		return undefined
	return `${major}.${minor}.${patch}`
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
