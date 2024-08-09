import {
	codeBlockOrThrow,
	regExpMatchedStep,
	type StepRunner,
} from '@bifravst/bdd-markdown'
import type { getAllAccountsSettings } from '@hello.nrfcloud.com/nrfcloud-api-helpers/settings'
import { Type } from '@sinclair/typebox'
import mqtt from 'mqtt'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { NRF_CLOUD_ACCOUNT } from '../../../settings/account.js'

const publishDeviceMessage = (
	allAccountSettings: Awaited<ReturnType<typeof getAllAccountsSettings>>,
) =>
	regExpMatchedStep(
		{
			regExp:
				/^the device `(?<id>[^`]+)` publishes this message to the topic `(?<topic>[^`]+)`$/,
			schema: Type.Object({
				id: Type.String(),
				topic: Type.String(),
			}),
		},
		async ({ match: { id, topic }, log: { progress, error }, step }) => {
			const message = JSON.parse(codeBlockOrThrow(step).code)

			const nRFCloudSettings = allAccountSettings[NRF_CLOUD_ACCOUNT]
			if (nRFCloudSettings === undefined) {
				throw new Error(`No default nRF Cloud settings (${NRF_CLOUD_ACCOUNT})!`)
			}

			progress(`Device id ${id} publishes to topic ${topic}`)
			await new Promise((resolve, reject) => {
				const mqttClient = mqtt.connect({
					host: nRFCloudSettings.mqttEndpoint,
					port: 8883,
					protocol: 'mqtts',
					protocolVersion: 4,
					clean: true,
					clientId: id,
					key: nRFCloudSettings.accountDevicePrivateKey,
					cert: nRFCloudSettings.accountDeviceClientCert,
					ca: readFileSync(
						path.join(process.cwd(), 'data', 'AmazonRootCA1.pem'),
						'utf-8',
					),
				})

				mqttClient.on('connect', () => {
					progress('connected')
					const mqttTopic = `${nRFCloudSettings.mqttTopicPrefix}${topic}`
					progress('publishing', message, mqttTopic)
					mqttClient.publish(mqttTopic, JSON.stringify(message), (error) => {
						if (error) return reject(error)
						mqttClient.end()
						return resolve(void 0)
					})
				})

				mqttClient.on('error', (err) => {
					error(err)
					reject(err)
				})
			})
		},
	)

export const steps = ({
	allAccountSettings,
}: {
	allAccountSettings: Awaited<ReturnType<typeof getAllAccountsSettings>>
}): StepRunner<Record<string, string>>[] => [
	publishDeviceMessage(allAccountSettings),
]
