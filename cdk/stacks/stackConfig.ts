export const STACK_NAME = process.env.STACK_NAME ?? 'nrf-guide'
export const TEST_STACK_NAME = `${STACK_NAME}-test`

export const STACK_SIMULATOR_NAME =
	process.env.STACK_SIMULATOR_NAME ?? 'nrf-guide-device-simulator'

export const NRFCLOUD_CLIENT_CERT_PARAM = 'NrfcloudClientCert'
export const NRFCLOUD_CLIENT_KEY_PARAM = 'NrfcloudClientKey'
export const NRFCLOUD_ACCOUNT_INFO_PARAM = 'NrfcloudAccountInfo'
export const IOT_CERT_PARAM = 'IotCert'
export const IOT_KEY_PARAM = 'IotKey'
export const IOT_ENDPOINT_PARAM = 'IotEndpoint'
