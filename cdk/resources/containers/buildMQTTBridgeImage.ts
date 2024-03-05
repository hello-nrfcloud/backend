import path from 'node:path'
import { type ImageBuilder, type ImageChecker } from '../../../aws/ecrImages.js'
import { type logFn } from '../../../cli/log.js'
import { getMosquittoLatestTag } from '../../../docker/getMosquittoLatestTag.js'
import { checkSumOfStrings } from '../../helpers/lambdas/checksumOfFiles.js'
import { hashFolder } from '../../../docker/hashFolder.js'
import { ContainerRepositoryId } from '../../../aws/getOrCreateRepository.js'

export const buildMQTTBridgeImage = async (
	builder: ImageBuilder,
	checker: ImageChecker,
	debug?: logFn,
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
