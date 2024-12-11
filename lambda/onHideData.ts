import type { AttributeValue } from '@aws-sdk/client-dynamodb'
import {
	DeleteThingShadowCommand,
	IoTDataPlaneClient,
} from '@aws-sdk/client-iot-data-plane'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import { requestLogger } from '@hello.nrfcloud.com/lambda-helpers/requestLogger'
import middy from '@middy/core'
import type { DynamoDBStreamEvent } from 'aws-lambda'

const iotData = new IoTDataPlaneClient({})

export const handler = middy()
	.use(requestLogger())
	.handler(async (event: DynamoDBStreamEvent): Promise<void> => {
		for (const record of event.Records) {
			const newImage = record.dynamodb?.NewImage
			const oldImage = record.dynamodb?.OldImage
			if (newImage === undefined || oldImage === undefined) {
				continue
			}
			const { hideDataBefore: oldHideDataBefore } = unmarshall(
				oldImage as Record<string, AttributeValue>,
			) as { hideDataBefore: string }
			const { deviceId, hideDataBefore } = unmarshall(
				newImage as Record<string, AttributeValue>,
			) as {
				deviceId: string
				hideDataBefore: string
			}

			if (hideDataBefore === oldHideDataBefore) {
				console.log(
					`No change in hideDataBefore for device ${deviceId}, skipping...`,
				)
				continue
			}
			console.log(
				`Hiding data before ${hideDataBefore} for device ${deviceId}...`,
			)
			console.log('Deleting lwm2m shadow for device', deviceId)
			await iotData.send(
				new DeleteThingShadowCommand({
					thingName: deviceId,
					shadowName: 'lwm2m',
				}),
			)
		}
	})
