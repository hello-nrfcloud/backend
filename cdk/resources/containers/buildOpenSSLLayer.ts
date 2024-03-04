import path from 'node:path'
import { type ImageBuilder, type ImageChecker } from '../../../aws/ecrImages.js'
import { hashFolder } from '../../../docker/hashFolder.js'
import type { LogFN } from '@nordicsemiconductor/firmware-ci-device-helpers'

export const buildOpenSSLLayer = async (
	builder: ImageBuilder,
	checker: ImageChecker,
	debug?: LogFN,
): Promise<string> => {
	const dockerFilePath = path.join(
		process.cwd(),
		'cdk',
		'resources',
		'containers',
		'openssl-lambda',
	)

	const tag = await hashFolder(dockerFilePath)

	if (
		await checker({
			tag,
			debug,
		})
	)
		return tag

	await builder({
		tag,
		dockerFilePath,
		debug,
	})
	return tag
}
