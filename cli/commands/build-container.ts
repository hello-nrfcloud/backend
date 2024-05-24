import type { ECRClient } from '@aws-sdk/client-ecr'
import type { SSMClient } from '@aws-sdk/client-ssm'
import { getOrCreateRepository } from '@bifravst/aws-cdk-ecr-helpers/repository'
import type { CommandDefinition } from './CommandDefinition.js'
import { debug as debugFn } from '../log.js'
import { buildMQTTBridgeImage } from '../../cdk/resources/containers/buildMQTTBridgeImage.js'
import {
	buildAndPublishImage,
	checkIfImageExists,
} from '@bifravst/aws-cdk-ecr-helpers/image'
import { buildCoAPSimulatorImage } from '../../cdk/resources/containers/buildCoAPSimulatorImage.js'
import { getCoAPHealthCheckSettings } from '../../settings/health-check/coap.js'
import { STACK_NAME } from '../../cdk/stackConfig.js'
import { ContainerRepositoryId } from '../../aws/ecr.js'

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
			flags: '-p, --pull',
		},
	],
	action: async (id, { debug: debugEnabled, pull }) => {
		const ensureRepo = getOrCreateRepository({ ecr })

		const debug = (debugEnabled as boolean) ? debugFn : undefined
		if (id === ContainerRepositoryId.MQTTBridge) {
			const mqttBridgeRepo = await ensureRepo({
				stackName: STACK_NAME,
				id: ContainerRepositoryId.MQTTBridge,
				debug,
			})
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
					pull as undefined | boolean,
				),
			)
		} else if (id === ContainerRepositoryId.CoAPSimulator) {
			const coapSimulatorRepo = await ensureRepo({
				stackName: STACK_NAME,
				id: ContainerRepositoryId.CoAPSimulator,
				debug,
			})
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
					pull as undefined | boolean,
				),
			)
		} else {
			throw new Error(`Unknown container ID: ${id}`)
		}
	},
	help: `Build the container needed to run the backend. <id> can be one of ${ContainerRepositoryId.MQTTBridge}, or ${ContainerRepositoryId.CoAPSimulator}`,
})
