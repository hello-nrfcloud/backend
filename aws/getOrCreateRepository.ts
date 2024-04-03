import {
	CreateRepositoryCommand,
	DescribeRepositoriesCommand,
	ECRClient,
	ImageTagMutability,
	RepositoryNotFoundException,
} from '@aws-sdk/client-ecr'
import type { logFn } from '../cli/log.js'
import { STACK_NAME } from '../cdk/stacks/stackConfig.js'

export type ContainerRepository = {
	uri: string
	name: string
}

export enum ContainerRepositoryId {
	MQTTBridge = 'mqtt-bridge',
	CoAPSimulator = 'coap-simulator',
}

export const repositoryName = (id: ContainerRepositoryId): string =>
	`${STACK_NAME}-${id}`

export const getOrCreateRepository =
	({ ecr }: { ecr: ECRClient }) =>
	async (
		id: ContainerRepositoryId,
		debug?: logFn,
	): Promise<ContainerRepository> => {
		const name = repositoryName(id)
		try {
			const result = await ecr.send(
				new DescribeRepositoriesCommand({
					repositoryNames: [name],
				}),
			)
			const uri = result.repositories?.[0]?.repositoryUri ?? ''
			return {
				name,
				uri,
			}
		} catch (error) {
			if (error instanceof RepositoryNotFoundException) {
				debug?.(`Repository ${name} does not exist. Create a new repository.`)
				// Create a repository
				const result = await ecr.send(
					new CreateRepositoryCommand({
						repositoryName: name,
						imageTagMutability: ImageTagMutability.IMMUTABLE,
					}),
				)

				return {
					name,
					uri: result.repository?.repositoryUri ?? '',
				}
			} else {
				throw error
			}
		}
	}
