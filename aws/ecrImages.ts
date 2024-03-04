import {
	DescribeImagesCommand,
	ECRClient,
	GetAuthorizationTokenCommand,
} from '@aws-sdk/client-ecr'
import type { logFn } from '../cli/log.js'
import { run } from '../util/run.js'
import type { ContainerRepository } from './getOrCreateRepository.js'

export type ImageChecker = (args: {
	tag: string
	debug?: logFn
}) => Promise<PersistedContainer | null>

export type PersistedContainer = {
	repo: ContainerRepository
	tag: string
}

export const checkIfImageExists =
	({
		ecr,
		repo,
	}: {
		ecr: ECRClient
		repo: ContainerRepository
	}): ImageChecker =>
	async ({ tag, debug }) => {
		debug?.(`Checking release image tag: ${tag} in ${repo.uri}...`)
		try {
			const result = await ecr.send(
				new DescribeImagesCommand({
					repositoryName: repo.name,
					imageIds: [{ imageTag: tag }],
				}),
			)

			const exists = result.imageDetails !== undefined

			if (exists) {
				debug?.(`Image tag ${tag} exists in ${repo.uri}.`)
				return {
					repo,
					tag,
				}
			} else {
				debug?.(`Image tag ${tag} does not exist in ${repo.uri}.`)
				return null
			}
		} catch (err) {
			debug?.(`Error when checking image tag ${tag} in ${repo.uri}!`, err)
			return null
		}
	}

export type ImageBuilder = (args: {
	dockerFilePath: string
	tag: string
	buildArgs?: Record<string, string>
	debug?: logFn
}) => Promise<void>

export const buildAndPublishImage =
	({
		ecr,
		repo,
	}: {
		ecr: ECRClient
		repo: ContainerRepository
	}): ImageBuilder =>
	async ({ dockerFilePath, tag, buildArgs, debug }) => {
		// Create a docker image
		debug?.(`Building docker image with tag ${tag}`)
		const baseArgs = ['buildx', 'build', '--platform', 'linux/amd64']
		const extraArgs =
			buildArgs !== undefined
				? Object.entries(buildArgs).reduce(
						(p, [key, value]) => p.concat(['--build-arg', `${key}=${value}`]),
						[] as string[],
					)
				: []
		await run({
			command: 'docker',
			args: [...baseArgs, ...extraArgs, '-t', tag, dockerFilePath],
			log: { debug },
		})

		const tokenResult = await ecr.send(new GetAuthorizationTokenCommand({}))
		const authorizationToken =
			tokenResult?.authorizationData?.[0]?.authorizationToken
		if (authorizationToken === undefined)
			throw new Error(`Could not get authorizationToken!`)
		const authToken = Buffer.from(authorizationToken, 'base64')
			.toString()
			.split(':')

		debug?.(`Login to ECR`)
		await run({
			command: 'docker',
			args: [
				'login',
				'--username',
				authToken[0] ?? '',
				'--password',
				authToken[1] ?? '',
				repo.uri,
			],
			log: { debug },
		})

		await run({
			command: 'docker',
			args: ['tag', `${tag}:latest`, `${repo.uri}:${tag}`],
			log: { debug },
		})

		debug?.(`Push local image to ECR`)
		await run({
			command: 'docker',
			args: ['push', `${repo.uri}:${tag}`],
			log: { debug },
		})
	}
