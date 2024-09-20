import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { SendTaskSuccessCommand, SFNClient } from '@aws-sdk/client-sfn'
import { fromEnv } from '@bifravst/from-env'
import { requestLogger } from '@hello.nrfcloud.com/lambda-helpers/requestLogger'
import {
	definitions,
	LwM2MObjectID,
	type DeviceInformation_14204,
} from '@hello.nrfcloud.com/proto-map/lwm2m'
import { FOTAJobTarget } from '@hello.nrfcloud.com/proto/hello'
import middy from '@middy/core'
import { getByPK, pkFromTarget, type PersistedJob } from '../jobRepo.js'

const { jobTableName } = fromEnv({
	jobTableName: 'JOB_TABLE_NAME',
})(process.env)

const sfn = new SFNClient({})
const db = new DynamoDBClient({})
const get = getByPK(db, jobTableName)

const objectKey =
	`${LwM2MObjectID.DeviceInformation_14204}:${definitions[LwM2MObjectID.DeviceInformation_14204].ObjectVersion}` as const

const h = async (event: {
	reported: {
		['14204:1.0']: {
			'0': Partial<DeviceInformation_14204['Resources']>
		}
	}
	deviceId: string
}): Promise<void> => {
	let maybeJob: PersistedJob | null = null
	let newVersion: string | undefined
	// Find a pending job for the device
	let type: 'app' | 'mfw' | undefined
	if ('3' in event.reported[objectKey as `14204:1.0`][0]) {
		// New Application firmware version reported
		maybeJob = await get(
			pkFromTarget({
				deviceId: event.deviceId,
				target: FOTAJobTarget.application,
			}),
		)
		newVersion = event.reported[objectKey as `14204:1.0`][0]['3']
		type = 'app'
	}
	if ('2' in event.reported[objectKey as `14204:1.0`][0]) {
		// New modem firmware version reported
		maybeJob = await get(
			pkFromTarget({
				deviceId: event.deviceId,
				target: FOTAJobTarget.modem,
			}),
		)
		newVersion = event.reported[objectKey as `14204:1.0`][0]['2']
		type = 'mfw'
	}
	if (maybeJob === null) {
		console.debug('No job found for device', event.deviceId)
		return
	}
	console.log(
		`Job found for device ${event.deviceId}`,
		JSON.stringify(maybeJob),
	)
	if (
		!('waitForUpdateAppliedTaskToken' in maybeJob) ||
		typeof maybeJob.waitForUpdateAppliedTaskToken !== 'string'
	) {
		console.error('No task token found for job', JSON.stringify(maybeJob))
		return
	}
	if (newVersion !== maybeJob.reportedVersion) {
		try {
			await sfn.send(
				new SendTaskSuccessCommand({
					taskToken: maybeJob.waitForUpdateAppliedTaskToken,
					output: JSON.stringify({
						[type === 'app' ? 'appVersion' : 'mfwVersion']: newVersion,
					}),
				}),
			)
			return
		} catch (e) {
			if (!(e instanceof Error)) throw e
			if (e.name === 'TaskDoesNotExist' || e.name === 'TaskTimedOut') {
				console.debug(`Could not update task: ${e.message}!`)
			}
			return
		}
	}
	console.debug('version already reported', newVersion)
}
export const handler = middy().use(requestLogger()).handler(h)
