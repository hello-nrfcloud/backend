import {
	DescribeImagesCommand,
	ECRClient,
	GetAuthorizationTokenCommand,
} from '@aws-sdk/client-ecr'
import type { logFn } from '../cli/log'
import { getMosquittoLatestTag } from '../docker/getMosquittoLatestTag'
import { hashFolder } from '../docker/hashFolder'
import { hasValues } from '../util/hasValues'
import { isFirstElementInArrayNotEmpty } from '../util/isFirstElementInArrayNotEmpty'
import { run } from '../util/run'

const imageTagOfRepositoryExists =
	({ ecr, repositoryName }: { repositoryName: string; ecr: ECRClient }) =>
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
			console.warn(
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
		debug,
	}: {
		ecr: ECRClient
		releaseImageTag?: string
		debug?: logFn
	}) =>
	async ({
		repositoryUri,
		repositoryName,
		dockerFilePath,
	}: {
		repositoryUri: string
		repositoryName: string
		dockerFilePath: string
	}): Promise<{ imageTag: string }> => {
		const imageTagExists = imageTagOfRepositoryExists({ ecr, repositoryName })

		// Deployment phase
		if (releaseImageTag !== undefined) {
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
		const hash = await hashFolder(dockerFilePath)
		const baseVersion = await getMosquittoLatestTag()
		const imageTag = `${hash}_${baseVersion}`

		debug?.(`Checking image tag: ${imageTag}`)
		const exists = await imageTagExists(imageTag)
		if (exists === true) {
			debug?.(`Image tag ${imageTag} exists on ${repositoryUri}`)
			return { imageTag }
		} else {
			debug?.(`Image tag ${imageTag} does not exist on ${repositoryUri}`)
			// Create a docker image
			debug?.(`Building docker image with tag ${imageTag}`)
			await run({
				command: 'docker',
				args: [
					'build',
					'--platform',
					'linux/amd64',
					'--build-arg',
					`MOSQUITTO_VERSION=${baseVersion}`,
					'-t',
					imageTag,
					dockerFilePath,
				],
			})

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
