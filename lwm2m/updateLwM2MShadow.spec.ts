import { describe, it, mock } from 'node:test'
import { updateLwM2MShadow } from './updateLwM2MShadow.js'
import { randomUUID } from 'node:crypto'
import { assertCall } from '../util/test/assertCall.js'
import { objectsToShadow } from './objectsToShadow.js'
import { LwM2MObjectID } from '@hello.nrfcloud.com/proto-map/lwm2m'

void describe('updateLwM2MShadow()', () => {
	void it("should update a device's LwM2M shadow", async () => {
		const iotData = {
			send: mock.fn(),
		}
		const deviceId = randomUUID()
		const objects = [
			{
				ObjectID: LwM2MObjectID.BatteryAndPower_14202,
				ObjectInstanceID: 0,
				ObjectVersion: '1.0',
				Resources: {
					1: 2.754,
					99: new Date(1688104200000),
				},
			},
		]
		const expectedReported = objectsToShadow(objects)

		await updateLwM2MShadow(iotData as any)(deviceId, objects)
		assertCall(iotData.send, {
			input: {
				thingName: deviceId,
				shadowName: 'lwm2m',
				payload: JSON.stringify({
					state: {
						reported: expectedReported,
					},
				}),
			},
		})
	})
})
