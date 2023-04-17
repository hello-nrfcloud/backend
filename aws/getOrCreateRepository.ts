import {
	CreateRepositoryCommand,
	DescribeRepositoriesCommand,
	ECRClient,
	ImageTagMutability,
	RepositoryNotFoundException,
} from '@aws-sdk/client-ecr'
import type { logFn } from '../cli/log'

export const getOrCreateRepository =
	({ ecr, error: logError }: { ecr: ECRClient; error?: logFn }) =>
	async (repositoryName: string): Promise<string> => {
		try {
			const result = await ecr.send(
				new DescribeRepositoriesCommand({
					repositoryNames: [repositoryName],
				}),
			)

			return result.repositories?.[0]?.repositoryUri ?? ''
		} catch (error) {
			if (error instanceof RepositoryNotFoundException) {
				console.warn(
					`Repository ${repositoryName} does not exist. Create a new repository.`,
				)
				// Create a repository
				const result = await ecr.send(
					new CreateRepositoryCommand({
						repositoryName,
						imageTagMutability: ImageTagMutability.IMMUTABLE,
					}),
				)

				return result.repository?.repositoryUri ?? ''
			} else {
				logError?.(error)
				throw error
			}
		}
	}
