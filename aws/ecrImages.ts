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
	id: string
	dockerFilePath: string
	tag: string
	buildArgs?: Record<string, string>
	debug?: logFn
	cwd?: string
}) => Promise<void>

export const buildAndPublishImage =
	({
		ecr,
		repo,
	}: {
		ecr: ECRClient
		repo: ContainerRepository
	}): ImageBuilder =>
	async ({ id, dockerFilePath, tag, buildArgs, debug, cwd }) => {
		// Create a docker image
		debug?.(`Building docker image ${id}`)
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
			args: [
				...baseArgs,
				...extraArgs,
				'-t',
				id,
				cwd ?? dockerFilePath,
				'-f',
				`${dockerFilePath}/Dockerfile`,
			],
			log: { debug, stderr: debug, stdout: debug },
		})

		await run({
			command: 'docker',
			args: ['tag', id, `${id}:latest`],
			log: { debug },
		})

		await run({
			command: 'docker',
			args: ['tag', id, `${id}:${tag}`],
			log: { debug },
		})

		await pushToECR({ ecr, repo })(id, tag, debug)
	}

const pushToECR =
	({ ecr, repo }: { ecr: ECRClient; repo: ContainerRepository }) =>
	async (id: string, tag: string, debug?: logFn): Promise<void> => {
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

		// Tag in ECR format (one registry per container)
		await run({
			command: 'docker',
			args: ['tag', `${id}:${tag}`, `${repo.uri}:${tag}`],
			log: { debug },
		})

		debug?.(`Push local image to ECR`)
		await run({
			command: 'docker',
			args: ['push', `${repo.uri}:${tag}`],
			log: { debug },
		})
	}
