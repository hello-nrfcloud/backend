import path from 'node:path'
import { type ImageBuilder, type ImageChecker } from '../../../aws/ecrImages.js'
import { hashFolder } from '../../../docker/hashFolder.js'
import { checkSumOfStrings } from '../../helpers/lambdas/checksumOfFiles.js'
import { type logFn } from '../../../cli/log.js'
import { ContainerRepositoryId } from '../../../aws/getOrCreateRepository.js'

export const buildCoAPSimulatorImage = async (
	builder: ImageBuilder,
	checker: ImageChecker,
	getSimulatorDownloadURL: () => Promise<URL>,
	debug?: logFn,
): Promise<string> => {
	const coapDockerfilePath = path.join(
		process.cwd(),
		'cdk',
		'resources',
		'containers',
		'coap',
	)
	const coapSimulatorDownloadUrl = await getSimulatorDownloadURL()

	const res = await fetch(coapSimulatorDownloadUrl, {
		method: 'HEAD',
	})
	if (!res.ok)
		throw new Error(`Failed to download CoAP simulator: ${await res.text()}`)
	const coapSimulatorBinaryHash = res.headers.get('etag')
	if (coapSimulatorBinaryHash === null)
		throw new Error(`[CoAP simulator] No ETag present in server response.`)

	const tag = checkSumOfStrings([
		await hashFolder(coapDockerfilePath),
		coapSimulatorBinaryHash,
	])

	if (await checker({ tag, debug })) return tag

	await builder({
		id: ContainerRepositoryId.CoAPSimulator,
		tag,
		dockerFilePath: coapDockerfilePath,
		buildArgs: {
			COAP_SIMULATOR_DOWNLOAD_URL: coapSimulatorDownloadUrl.toString(),
		},
		debug,
	})

	return tag
}
