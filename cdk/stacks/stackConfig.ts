export const STACK_NAME = process.env.STACK_NAME ?? 'muninn'
export const TEST_RESOURCES_STACK_NAME = `${STACK_NAME}-test`
// The container registry is shared between the test and the production stack
export const ECR_NAME = process.env.REPOSITORY_NAME ?? 'mqtt-bridge'
