export const STACK_NAME = process.env.STACK_NAME ?? 'hello-nrfcloud-backend'
export const CI_STACK_NAME = process.env.STACK_NAME ?? `${STACK_NAME}-ci`
export const TEST_RESOURCES_STACK_NAME = `${STACK_NAME}-test`

// The container registry is shared between the test and the production stack
export const ECR_NAME = process.env.REPOSITORY_NAME ?? 'mqtt-bridge'
export const ECR_NAME_COAP_SIMULATOR =
	process.env.REPOSITORY_COAP_SIMULATOR ?? 'coap-simulator'
