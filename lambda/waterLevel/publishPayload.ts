import { readFile } from 'fs/promises'
import { MqttClient, connect } from 'mqtt'
import path from 'path'
import { getDeviceCredentials } from './getDeviceCredentials'
import type { SenMLType } from '@hello.nrfcloud.com/proto-lwm2m'

export const publishPayload = async (
	deviceId: string,
	key: string,
	payload: SenMLType,
): Promise<void> => {
	const accountId = ``
	const credentials = await getDeviceCredentials('credentials')
	const certificate = credentials[`${key}/certificate`]
	const privateKey = credentials[`${key}/privateKey`]
	if (certificate === undefined || privateKey === undefined) {
		//Do something
	}
	const conn = await new Promise<MqttClient>(async (resolve, reject) => {
		const client = connect({
			host: 'mqtt.nrfcloud.com',
			port: 8883,
			rejectUnauthorized: true,
			clientId: deviceId,
			protocol: 'mqtts',
			protocolVersion: 4,
			key: privateKey,
			cert: certificate,
			ca: await readFile(
				path.join(process.cwd(), 'data', 'AmazonRootCA1.pem'),
				'utf-8',
			),
		})

		client.on('disconnect', () => {
			console.debug('disconnected')
		})
		client.on('error', () => {
			console.debug('error')
			reject()
		})
		client.on('connect', async () => {
			console.log(`Connected`, deviceId)
			resolve(client)
		})
	})
	const topic = `prod/${accountId}/m/senml/${deviceId}`
	const publish = async (payload: SenMLType) => {
		conn.publish(topic, JSON.stringify(payload))
	}
	console.log(payload)
	await publish(payload)

	conn.end()
}
