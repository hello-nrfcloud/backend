import { DynamoDBClient, paginateScan } from '@aws-sdk/client-dynamodb'
import {
	GetThingShadowCommand,
	IoTDataPlaneClient,
} from '@aws-sdk/client-iot-data-plane'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import { shadowToObjects } from '@hello.nrfcloud.com/proto-map/lwm2m/aws'

const db = new DynamoDBClient({})
const iotData = new IoTDataPlaneClient({})

const devices = []

for await (const { Items } of paginateScan(
	{
		client: db,
	},
	{
		TableName:
			'hello-nrfcloud-backend-DevicesTabledevicesTable87DE7A65-1CCQ7YDQXRWUB',
	},
)) {
	for (const device of Items ?? []) {
		const deviceId = unmarshall(device).deviceId
		devices.push(deviceId)
	}
}

for (const deviceId of devices) {
	try {
		const { payload } = await iotData.send(
			new GetThingShadowCommand({
				shadowName: 'lwm2m',
				thingName: deviceId,
			}),
		)
		const objects = shadowToObjects(
			JSON.parse(Buffer.from(payload!).toString('utf-8')).state.reported,
		)
		const imei = objects.find(({ ObjectID }) => ObjectID === 14204)
			?.Resources[1]
		console.log(deviceId, imei ?? '-')
	} catch {
		// pass
	}
}
