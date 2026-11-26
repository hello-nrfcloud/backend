export const Scopes = {
	STACK: 'stack',
	NRFCLOUD_BRIDGE_CERTIFICATE: 'nRFCloudBridgeCertificate',
} as const
export type Scopes = (typeof Scopes)[keyof typeof Scopes]

export type ScopeContext = {
	scope: string
	context: string
}

export const ScopeContexts = {
	STACK_MQTT_BRIDGE: {
		scope: Scopes.STACK,
		context: 'mqttBridge',
	} as ScopeContext,
	NRFCLOUD_BRIDGE_CERTIFICATE_MQTT: {
		scope: Scopes.NRFCLOUD_BRIDGE_CERTIFICATE,
		context: 'MQTT',
	} as ScopeContext,
	NRFCLOUD_BRIDGE_CERTIFICATE_CA: {
		scope: Scopes.NRFCLOUD_BRIDGE_CERTIFICATE,
		context: 'CA',
	} as ScopeContext,
	STACK_FEEDBACK: {
		scope: Scopes.STACK,
		context: 'feedback',
	} as ScopeContext,
	STACK_MEMFAULT: {
		scope: Scopes.STACK,
		context: 'memfault',
	} as ScopeContext,
	STACK_MAP: {
		scope: Scopes.STACK,
		context: 'map',
	} as ScopeContext,
} as const
