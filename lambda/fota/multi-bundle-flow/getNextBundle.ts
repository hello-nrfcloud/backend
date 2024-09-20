import { requestLogger } from '@hello.nrfcloud.com/lambda-helpers/requestLogger'
import type { FOTAJob } from '@hello.nrfcloud.com/proto/hello'
import middy from '@middy/core'
import type { Static } from '@sinclair/typebox'
import { type DeviceFirmwareDetails } from '../getDeviceFirmwareDetails.js'
import { getNextUpgrade } from '../getNextUpgrade.js'

const h = async (event: {
	deviceFirmwareDetails: DeviceFirmwareDetails
	usedVersions?: Record<string, string>
	upgradePath: Static<typeof FOTAJob>['upgradePath']
}): Promise<{
	bundleId: string | null
}> => {
	const maybeBundleId = getNextUpgrade(
		event.upgradePath,
		event.deviceFirmwareDetails,
	)
	if ('error' in maybeBundleId) {
		throw maybeBundleId.error
	}
	const { bundleId, reportedVersion } = maybeBundleId.upgrade
	if (
		bundleId === null ||
		(new Set(Object.keys(event.usedVersions ?? {})).has(reportedVersion) ??
			false)
	) {
		return {
			bundleId: null,
		}
	}
	return {
		bundleId,
	}
}
export const handler = middy().use(requestLogger()).handler(h)
