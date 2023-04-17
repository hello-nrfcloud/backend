import {
	DescribeImagesCommand,
	ECRClient,
	GetAuthorizationTokenCommand,
	ImageNotFoundException,
} from '@aws-sdk/client-ecr'
import type { logFn } from '../cli/log'
import { getMosquittoLatestTag } from '../docker/getMosquittoLatestTag'
import { hashFolder } from '../docker/hashFolder'
import { run } from '../util/run'

export const getOrBuildDockerImage =
	({
		ecr,
		debug,
		error: logError,
	}: {
		ecr: ECRClient
		debug?: logFn
		error?: logFn
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
		const hash = await hashFolder(dockerFilePath)
		const baseVersion = await getMosquittoLatestTag()
		const imageTag = `${hash}_${baseVersion}`

		try {
			debug?.(`Checking image tag: ${imageTag}`)
			await ecr.send(
				new DescribeImagesCommand({
					repositoryName,
					imageIds: [{ imageTag }],
				}),
			)

			debug?.(`Image tag ${imageTag} exists on ${repositoryUri}`)
			return { imageTag }
		} catch (error) {
			if (error instanceof ImageNotFoundException) {
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
					tokenResult.authorizationData !== undefined &&
					tokenResult.authorizationData.length > 0 &&
					typeof tokenResult.authorizationData[0]?.authorizationToken ===
						'string'
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
			} else {
				logError?.(error)
				throw error
			}
		}
	}
