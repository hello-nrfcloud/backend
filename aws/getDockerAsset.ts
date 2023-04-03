import { DescribeImagesCommand, type ECRClient } from '@aws-sdk/client-ecr'

export const getDockerAsset =
	({ ecr }: { ecr: ECRClient }) =>
	async ({
		repositoryName,
		imageTag,
	}: {
		repositoryName: string
		imageTag: string
	}): Promise<string | undefined> => {
		try {
			const result = await ecr.send(
				new DescribeImagesCommand({
					repositoryName,
					imageIds: [
						{
							imageTag,
						},
					],
				}),
			)

			return result.imageDetails?.[0]?.imageDigest
		} catch (error) {
			console.warn(
				`Image with tag ${imageTag} is not found on ${repositoryName}`,
			)

			return undefined
		}
	}
