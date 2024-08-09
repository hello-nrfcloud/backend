import { hashFolder } from '@bifravst/aws-cdk-ecr-helpers/hashFolder'
import {
	type ImageBuilder,
	type ImageChecker,
} from '@bifravst/aws-cdk-ecr-helpers/image'
import { checkSumOfStrings } from '@bifravst/aws-cdk-lambda-helpers/util'
import path from 'node:path'
import { ContainerRepositoryId } from '../../../aws/ecr.js'
import { type logFn } from '../../../cli/log.js'
import { getMosquittoLatestTag } from '../../../docker/getMosquittoLatestTag.js'

export const buildMQTTBridgeImage = async (
	builder: ImageBuilder,
	checker: ImageChecker,
	debug?: logFn,
	pull?: boolean,
): Promise<string> => {
	const mosquittoVersion = await getMosquittoLatestTag()
	debug?.(`mosquittoLatestTag: ${mosquittoVersion}`)
	const dockerFilePath = path.join(
		process.cwd(),
		'cdk',
		'resources',
		'containers',
		'bridge',
	)

	const tag = checkSumOfStrings([
		mosquittoVersion,
		await hashFolder(dockerFilePath),
	])

	if (
		await checker({
			tag,
			debug,
			pull,
		})
	)
		return tag

	await builder({
		id: ContainerRepositoryId.MQTTBridge,
		tag,
		dockerFilePath,
		buildArgs: {
			MOSQUITTO_VERSION: mosquittoVersion,
		},
		debug,
	})
	return tag
}
