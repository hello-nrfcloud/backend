import mqtt from 'mqtt'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'url'
import {
	getAccountInfoSSM,
	getNrfcloudCredentialsSSM,
} from '../../bin/lib/nrfcloud.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

async function getDeviceCredentials(): Promise<{
	endpoint: string
	topicPrefix: string
	certificate: string
	privateKey: string
	caCertificate: string
}> {
	const [accountInfo, credentials, caCertificate] = await Promise.all([
		getAccountInfoSSM(),
		getNrfcloudCredentialsSSM(),
		readFile(path.join(__dirname, 'AmazonRootCA1.pem'), { encoding: 'utf-8' }),
	])

	return {
		endpoint: accountInfo.mqttEndpoint,
		topicPrefix: accountInfo.mqttTopicPrefix,
		certificate: credentials.clientCert ?? '',
		privateKey: credentials.privateKey ?? '',
		caCertificate,
	}
}

async function publishMessage(
	id: string,
	topic: string,
	message: Record<string, unknown>,
): Promise<void> {
	const info = await getDeviceCredentials()
	const mqttClient = mqtt.connect({
		host: info.endpoint,
		port: 8883,
		protocol: 'mqtts',
		protocolVersion: 4,
		clean: true,
		clientId: id,
		key: info.privateKey,
		cert: info.certificate,
		ca: info.caCertificate,
	})

	await new Promise((resolve, reject) => {
		mqttClient.publish(
			`${info.topicPrefix}${topic}`,
			JSON.stringify(message),
			(error) => {
				if (error) return reject(error)

				mqttClient.end()
				return resolve(void 0)
			},
		)
	})
}

export { publishMessage }
