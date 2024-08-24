import { bundleIdToType, FOTAJobTarget } from '@hello.nrfcloud.com/proto/hello'
import { type DeviceFirmwareDetails } from './getDeviceFirmwareDetails.js'
import { type PersistedJob } from './jobRepo.js'

const targetFromUpgradePath = (
	upgradePath: PersistedJob['upgradePath'],
):
	| {
			error: Error
	  }
	| {
			target: FOTAJobTarget
	  } => {
	const target = new Set(
		Object.values(upgradePath).map((bundleId) => bundleIdToType(bundleId)),
	)
	if (target.size !== 1)
		return {
			error: new Error(`A job must have a single target!`),
		}
	return {
		target: target.values().next().value,
	}
}

/**
 * Returns the next eligible bundle ID for a FOTA job, or an error
 */
export const getNextUpgrade = (
	upgradePath: PersistedJob['upgradePath'],
	details: DeviceFirmwareDetails,
):
	| {
			error: Error
	  }
	| {
			upgrade: {
				reportedVersion: string
				bundleId: string | null
				target: FOTAJobTarget
			}
	  } => {
	const { appVersion, mfwVersion, supportedFOTATypes } = details

	const maybeTarget = targetFromUpgradePath(upgradePath)
	if ('error' in maybeTarget) return maybeTarget
	const { target } = maybeTarget

	if (!supportedFOTATypes.includes(target))
		return {
			error: new Error(
				`The device does not support FOTA for target ${target}!`,
			),
		}

	if (target === FOTAJobTarget.application && appVersion === undefined) {
		return {
			error: new Error(
				`The device has not reported an application firmware version!`,
			),
		}
	}

	if (target === FOTAJobTarget.modem && mfwVersion === undefined) {
		return {
			error: new Error(`The device has not reported a modem firmware version!`),
		}
	}

	const reportedVersion = (
		target === FOTAJobTarget.application ? appVersion : mfwVersion
	) as string

	return {
		upgrade: {
			reportedVersion,
			// There may no further upgrades defined
			bundleId: upgradePath[reportedVersion] ?? null,
			target,
		},
	}
}
