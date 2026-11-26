export const ContainerRepositoryId = {
	MQTTBridge: 'mqtt-bridge',
} as const
export type ContainerRepositoryId =
	(typeof ContainerRepositoryId)[keyof typeof ContainerRepositoryId]
