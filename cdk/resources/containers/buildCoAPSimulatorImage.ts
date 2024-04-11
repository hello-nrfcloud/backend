import path from 'node:path'
import {
	type ImageBuilder,
	type ImageChecker,
} from '@bifravst/aws-cdk-ecr-helpers/image'
import { hashFolder } from '@bifravst/aws-cdk-ecr-helpers/hashFolder'
import { checkSumOfStrings } from '@bifravst/aws-cdk-lambda-helpers/util'
import { type logFn } from '../../../cli/log.js'
import { ContainerRepositoryId } from '../../../aws/ecr.js'

export const buildCoAPSimulatorImage = async (
	builder: ImageBuilder,
	checker: ImageChecker,
	getSimulatorDownloadURL: () => Promise<URL>,
	debug?: logFn,
	pull?: boolean,
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

	if (await checker({ tag, debug, pull })) return tag

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
