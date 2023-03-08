import {
	generateIotCredentials,
	getIotCredentialsSSM,
	getIoTEndpoint,
	saveIotCredentialsSSM,
} from './lib/iot.js'

import {
	AccountInfo,
	deleteNrfcloudCredentials,
	generateNrfcloudCredentials,
	getAccountInfo,
	getNrfcloudCredentialsSSM,
	saveNrfcloudAccountInfosSSM,
	saveNrfcloudCredentialsSSM,
} from './lib/nrfcloud.js'

type CliInput = {
	apiKey: string
	reset: boolean
	endpoint: string
}
async function ensureNrfcloudCredentials(
	input: CliInput,
	accountInfo: AccountInfo,
): Promise<void> {
	const res = await getNrfcloudCredentialsSSM()
	if (res.privateKey == null || res.clientCert == null || input.reset) {
		console.log('Deleting old account device credentials')
		await deleteNrfcloudCredentials(input)

		console.log('Generating new account device credentials')
		const credentials = await generateNrfcloudCredentials(input)
		await Promise.all([
			saveNrfcloudCredentialsSSM(credentials),
			saveNrfcloudAccountInfosSSM(accountInfo),
		])
		console.log(`Saved new account device credentials`)
	} else {
		console.log(`Existing account device credentials were present, reuse them`)
	}
}

async function ensureIotCredentials(input: CliInput, iotEndpoint: string) {
	const res = await getIotCredentialsSSM()
	if (res.privateKey == null || res.clientCert == null || input.reset) {
		console.log('Generating new IoT credentials')
		const credentials = await generateIotCredentials()
		await saveIotCredentialsSSM(credentials, iotEndpoint)
		console.log(`Saved new iot credentials`)
	} else {
		console.log(`Existing iot credentials were present, reuse them`)
	}
}

export async function initializeMQTTBridge(input: CliInput): Promise<void> {
	const accountInfo = await getAccountInfo(input)
	const iotEndpoint = await getIoTEndpoint()

	console.log(`AWS IoT endpoint: ${iotEndpoint}`)
	console.log('Retrieved Nrfcloud account info:')
	console.log(JSON.stringify(accountInfo, null, 2))

	await ensureNrfcloudCredentials(input, accountInfo)
	await ensureIotCredentials(input, iotEndpoint ?? '')

	console.log('All certificates have been saved on SSM')
}
