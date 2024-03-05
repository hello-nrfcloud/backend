import path from 'node:path'
import { type ImageBuilder, type ImageChecker } from '../../../aws/ecrImages.js'
import { hashFolder } from '../../../docker/hashFolder.js'
import type { LogFN } from '@nordicsemiconductor/firmware-ci-device-helpers'
import { checkSumOfStrings } from '../../helpers/lambdas/checksumOfFiles.js'
import fs from 'node:fs/promises'
import { run } from '../../../util/run.js'
import os from 'node:os'
import { packLambdaFromPath } from '../../helpers/lambdas/packLambdaFromPath.js'
import { ContainerRepositoryId } from '../../../aws/getOrCreateRepository.js'

export const buildOpenSSLLambdaImage = async (
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

	const { zipFile, hash } = await packLambdaFromPath(
		'openSSL',
		'lambda/map/openSSL.ts',
	)

	const tag = checkSumOfStrings([await hashFolder(dockerFilePath), hash])

	if (
		await checker({
			tag,
			debug,
		})
	) {
		return tag
	}

	const distDir = await fs.mkdtemp(path.join(os.tmpdir(), path.sep))

	await run({
		command: 'unzip',
		args: [zipFile, '-d', path.join(distDir, 'lambda')],
		log: { debug, stderr: debug, stdout: debug },
	})

	await builder({
		id: ContainerRepositoryId.OpenSSLLambda,
		tag,
		dockerFilePath,
		debug,
		cwd: distDir,
	})
	return tag
}
