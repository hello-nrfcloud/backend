import { randomUUID } from 'crypto'
import {
	generateIotCredentials,
	getIoTEndpoint,
	saveIotCredentialsSSM,
} from '../../../bin/lib/iot.js'
import {
	saveNrfcloudAccountInfosSSM,
	saveNrfcloudCredentialsSSM,
	type AccountInfo,
} from '../../../bin/lib/nrfcloud.js'

export async function mock(): Promise<void> {
	// Create mock nRF Cloud credential
	const endpoint = await getIoTEndpoint()
	const tenantId = randomUUID()

	const accountInfo: AccountInfo = {
		mqttEndpoint: endpoint ?? '',
		mqttTopicPrefix: `prod/${tenantId}/`,
		tenantId,
		accountDeviceClientId: `account-${tenantId}`,
	}

	const credentials = await generateIotCredentials()
	await Promise.all([
		saveNrfcloudCredentialsSSM(credentials),
		saveNrfcloudAccountInfosSSM(accountInfo),
	])

	// Create mock IoT credential
	const iotCredentials = await generateIotCredentials()
	await saveIotCredentialsSSM(iotCredentials, endpoint ?? '')
}
