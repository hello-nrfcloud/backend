import { DynamoDBClient, type AttributeValue } from '@aws-sdk/client-dynamodb'
import { IoTDataPlaneClient } from '@aws-sdk/client-iot-data-plane'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import { fromEnv } from '@bifravst/from-env'
import { requestLogger } from '@hello.nrfcloud.com/lambda-helpers/requestLogger'
import {
	LwM2MObjectID,
	type DeviceInformation_14204,
	type NRFCloudServiceInfo_14401,
} from '@hello.nrfcloud.com/proto-map/lwm2m'
import { FOTAJobStatus, FOTAJobTarget } from '@hello.nrfcloud.com/proto/hello'
import middy from '@middy/core'
import type { DynamoDBStreamEvent } from 'aws-lambda'
import { isObject } from 'lodash-es'
import { getLwM2MShadow } from '../../lwm2m/getLwM2MShadow.js'
import { update, type PersistedJob } from './jobRepo.js'

const { TableName } = fromEnv({
	TableName: 'JOB_TABLE_NAME',
})(process.env)

const db = new DynamoDBClient({})
const iotData = new IoTDataPlaneClient({})

const u = update(db, TableName)

const getShadow = getLwM2MShadow(iotData)

/**
 * Invoked when an entry in the FOTA Job table is updated.
 */
const h = async (event: DynamoDBStreamEvent): Promise<void> => {
	for (const record of event.Records) {
		const update = record.dynamodb?.NewImage
		if (update === undefined) {
			continue
		}
		const job = unmarshall(
			update as {
				[key: string]: AttributeValue
			},
		) as PersistedJob
		console.log(JSON.stringify({ job }))

		try {
			switch (job.status) {
				case FOTAJobStatus.NEW:
				case FOTAJobStatus.IN_PROGRESS:
					// Start the next job
					const maybeShadow = await getShadow({
						id: job.deviceId,
					})
					if ('error' in maybeShadow) {
						console.error(maybeShadow.error)
						throw new Error(
							`Unknown device state: ${maybeShadow.error.message}!`,
						)
					}

					const supportedFOTATypes =
						maybeShadow.shadow.reported.find(isNRFCloudServiceInfo)
							?.Resources[0] ?? []
					const appVersion =
						maybeShadow.shadow.reported.find(isDeviceInfo)?.Resources[3]
					const mfwVersion =
						maybeShadow.shadow.reported.find(isDeviceInfo)?.Resources[2]

					if (supportedFOTATypes.length === 0) {
						throw new Error(`This device does not support FOTA!`)
					}

					if (
						job.target === FOTAJobTarget.application &&
						appVersion === undefined
					) {
						throw new Error(
							`This device has not yet reported an application firmware version!`,
						)
					}

					if (job.target === FOTAJobTarget.modem && mfwVersion === undefined) {
						throw new Error(
							`This device has not yet reported a modem firmware version!`,
						)
					}

					const reportedVersion = (
						job.target === FOTAJobTarget.application ? appVersion : mfwVersion
					) as string
					console.debug(JSON.stringify({ reportedVersion }))

					const bundleId = job.upgradePath[reportedVersion]
					if (bundleId === undefined) {
						await u(
							{
								status: FOTAJobStatus.SUCCEEDED,
								statusDetail: `No upgrade path defined for version ${reportedVersion}.`,
							},
							job,
						)
						return
					}

					await u(
						{
							status: FOTAJobStatus.IN_PROGRESS,
							statusDetail: `Starting job for version ${reportedVersion} with bundle ${bundleId}: ${jobId}.`,
						},
						job,
					)
					break
				default:
					throw new Error(`Unknown job status: ${job.status}!`)
			}
		} catch (error) {
			await u(
				{
					status: FOTAJobStatus.FAILED,
					statusDetail: 'Unknown job status',
				},
				job,
			)
		}
	}
}

export const handler = middy().use(requestLogger()).handler(h)

const isNRFCloudServiceInfo = (
	instance: unknown,
): instance is NRFCloudServiceInfo_14401 =>
	isObject(instance) &&
	'ObjectID' in instance &&
	instance.ObjectID === LwM2MObjectID.NRFCloudServiceInfo_14401

const isDeviceInfo = (instance: unknown): instance is DeviceInformation_14204 =>
	isObject(instance) &&
	'ObjectID' in instance &&
	instance.ObjectID === LwM2MObjectID.DeviceInformation_14204
