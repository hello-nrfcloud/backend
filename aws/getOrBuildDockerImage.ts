import {
	DescribeImagesCommand,
	ECRClient,
	GetAuthorizationTokenCommand,
} from '@aws-sdk/client-ecr'
import type { logFn } from '../cli/log'
import { hasValues } from '../util/hasValues.js'
import { isFirstElementInArrayNotEmpty } from '../util/isFirstElementInArrayNotEmpty.js'
import { run } from '../util/run.js'

const imageTagOfRepositoryExists =
	({
		ecr,
		repositoryName,
		error: logError,
	}: {
		repositoryName: string
		ecr: ECRClient
		error?: logFn
	}) =>
	async (imageTag: string): Promise<boolean> => {
		try {
			const result = await ecr.send(
				new DescribeImagesCommand({
					repositoryName,
					imageIds: [{ imageTag }],
				}),
			)

			if (
				hasValues(result, 'imageDetails') &&
				isFirstElementInArrayNotEmpty(result.imageDetails, 'imageTags')
			) {
				return result.imageDetails[0].imageTags.includes(imageTag)
			}

			return false
		} catch (error) {
			logError?.(
				`Error when checking image tag ${imageTag} in ${repositoryName}`,
				error,
			)
			return false
		}
	}

export const getOrBuildDockerImage =
	({
		ecr,
		releaseImageTag,
		beforeBuild,
		afterBuild,
		debug,
		error: logError,
	}: {
		ecr: ECRClient
		releaseImageTag?: string
		beforeBuild?: () => Promise<void>
		afterBuild?: () => Promise<void>
		debug?: logFn
		error?: logFn
	}) =>
	async ({
		repositoryUri,
		repositoryName,
		dockerFilePath,
		imageTagFactory,
		buildArgs,
	}: {
		repositoryUri: string
		repositoryName: string
		dockerFilePath: string
		imageTagFactory: () => Promise<string>
		buildArgs?: Record<string, string>
	}): Promise<{ imageTag: string }> => {
		const imageTagExists = imageTagOfRepositoryExists({
			ecr,
			repositoryName,
			error: logError,
		})

		// Deployment phase
		if (releaseImageTag !== undefined && releaseImageTag !== '') {
			debug?.(
				`Checking release image tag: ${releaseImageTag} in ${repositoryName} repository`,
			)
			const exists = await imageTagExists(releaseImageTag)
			if (exists === false)
				throw new Error(
					`Release image tag ${releaseImageTag} is not found in ${repositoryName} repository`,
				)

			return { imageTag: releaseImageTag }
		}

		// During develop phase
		const imageTag = await imageTagFactory()

		debug?.(`Checking image tag: ${imageTag}`)
		const exists = await imageTagExists(imageTag)
		if (exists === true) {
			debug?.(`Image tag ${imageTag} exists on ${repositoryUri}`)
			return { imageTag }
		} else {
			if (beforeBuild !== undefined) await beforeBuild()
			debug?.(`Image tag ${imageTag} does not exist on ${repositoryUri}`)
			// Create a docker image
			debug?.(`Building docker image with tag ${imageTag}`)
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
				args: [...baseArgs, ...extraArgs, '-t', imageTag, dockerFilePath],
			})
			if (afterBuild !== undefined) await afterBuild()

			const tokenResult = await ecr.send(new GetAuthorizationTokenCommand({}))
			if (
				hasValues(tokenResult, 'authorizationData') &&
				isFirstElementInArrayNotEmpty(
					tokenResult.authorizationData,
					'authorizationToken',
				)
			) {
				const authToken = Buffer.from(
					tokenResult.authorizationData[0].authorizationToken,
					'base64',
				)
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
						repositoryUri,
					],
				})

				await run({
					command: 'docker',
					args: ['tag', `${imageTag}:latest`, `${repositoryUri}:${imageTag}`],
				})

				debug?.(`Push local image to ECR`)
				await run({
					command: 'docker',
					args: ['push', `${repositoryUri}:${imageTag}`],
				})
			}

			return { imageTag }
		}
	}
