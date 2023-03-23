import { DescribeEndpointCommand, IoTClient } from '@aws-sdk/client-iot'
import { isString } from '../util/isString.js'

export const getIoTEndpoint =
	({ iot }: { iot: IoTClient }) =>
	async (): Promise<string> => {
		const result = await iot.send(
			new DescribeEndpointCommand({ endpointType: 'iot:Data-ATS' }),
		)

		if (!isString(result.endpointAddress)) {
			throw new Error(`Could not determine IoT endpoint!`)
		}

		return result.endpointAddress
	}
