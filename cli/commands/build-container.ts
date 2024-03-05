import { ECRClient } from '@aws-sdk/client-ecr'
import type { SSMClient } from '@aws-sdk/client-ssm'
import {
	ContainerRepositoryId,
	getOrCreateRepository,
} from '../../aws/getOrCreateRepository.js'
import type { CommandDefinition } from './CommandDefinition.js'
import { debug as debugFn } from '../log.js'
import { buildMQTTBridgeImage } from '../../cdk/resources/containers/buildMQTTBridgeImage.js'
import {
	buildAndPublishImage,
	checkIfImageExists,
} from '../../aws/ecrImages.js'
import { buildCoAPSimulatorImage } from '../../cdk/resources/containers/buildCoAPSimulatorImage.js'
import { getCoAPHealthCheckSettings } from '../../nrfcloud/coap-health-check.js'
import { STACK_NAME } from '../../cdk/stacks/stackConfig.js'
import { buildOpenSSLLambdaImage } from '../../cdk/resources/containers/buildOpenSSLLambdaImage.js'

export const buildContainersCommand = ({
	ecr,
	ssm,
}: {
	ecr: ECRClient
	ssm: SSMClient
}): CommandDefinition => ({
	command: 'build-container <id>',
	options: [
		{
			flags: '-d, --debug',
		},
		{
			flags: '-f, --force',
		},
	],
	action: async (id, { debug: debugEnabled, force }) => {
		const ensureRepo = getOrCreateRepository({ ecr })

		const debug = (debugEnabled as boolean) ? debugFn : undefined
		if (id === ContainerRepositoryId.MQTTBridge) {
			const mqttBridgeRepo = await ensureRepo(
				ContainerRepositoryId.MQTTBridge,
				debug,
			)
			process.stdout.write(
				await buildMQTTBridgeImage(
					buildAndPublishImage({
						ecr,
						repo: mqttBridgeRepo,
					}),
					checkIfImageExists({
						ecr,
						repo: mqttBridgeRepo,
					}),
					debugFn('MQTT bridge image'),
				),
			)
		} else if (id === ContainerRepositoryId.CoAPSimulator) {
			const coapSimulatorRepo = await ensureRepo(
				ContainerRepositoryId.CoAPSimulator,
				debug,
			)
			process.stdout.write(
				await buildCoAPSimulatorImage(
					buildAndPublishImage({
						ecr,
						repo: coapSimulatorRepo,
					}),
					checkIfImageExists({
						ecr,
						repo: coapSimulatorRepo,
					}),
					async () =>
						(
							await getCoAPHealthCheckSettings({
								ssm,
								stackName: STACK_NAME,
							})
						).simulatorDownloadURL,
					debugFn('CoAP simulator image'),
				),
			)
		} else if (id === ContainerRepositoryId.OpenSSLLambda) {
			const openSSLLayerRepo = await ensureRepo(
				ContainerRepositoryId.OpenSSLLambda,
				debug,
			)
			process.stdout.write(
				await buildOpenSSLLambdaImage(
					buildAndPublishImage({
						ecr,
						repo: openSSLLayerRepo,
					}),
					force === true
						? async () => Promise.resolve(null)
						: checkIfImageExists({
								ecr,
								repo: openSSLLayerRepo,
							}),
					debugFn('OpenSSL lambda image'),
				),
			)
		} else {
			throw new Error(`Unknown container ID: ${id}`)
		}
	},
	help: `Build the container needed to run the backend. <id> can be one of ${ContainerRepositoryId.MQTTBridge}, ${ContainerRepositoryId.CoAPSimulator}, or ${ContainerRepositoryId.OpenSSLLambda}`,
})
