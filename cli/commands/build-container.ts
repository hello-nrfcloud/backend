import type { ECRClient } from '@aws-sdk/client-ecr'
import {
	buildAndPublishImage,
	checkIfImageExists,
} from '@bifravst/aws-cdk-ecr-helpers/image'
import { getOrCreateRepository } from '@bifravst/aws-cdk-ecr-helpers/repository'
import { ContainerRepositoryId } from '../../aws/ecr.ts'
import { buildMQTTBridgeImage } from '../../cdk/resources/containers/buildMQTTBridgeImage.ts'
import { STACK_NAME } from '../../cdk/stackConfig.ts'
import { debug as debugFn } from '../log.ts'
import type { CommandDefinition } from './CommandDefinition.ts'

export const buildContainersCommand = ({
	ecr,
}: {
	ecr: ECRClient
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
		} else {
			throw new Error(`Unknown container ID: ${id}`)
		}
	},
	help: `Build the container needed to run the backend. <id> can be one of ${ContainerRepositoryId.MQTTBridge}`,
})
