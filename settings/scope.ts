export enum Scopes {
	STACK = 'stack',
	NRFCLOUD_BRIDGE_CERTIFICATE = 'nRFCloudBridgeCertificate',
}

export type ScopeContext = {
	scope: string
	context: string
}

export const ScopeContexts = {
	STACK_MQTT_BRIDGE: <ScopeContext>{
		scope: Scopes.STACK,
		context: 'mqttBridge',
	},
	NRFCLOUD_BRIDGE_CERTIFICATE_MQTT: <ScopeContext>{
		scope: Scopes.NRFCLOUD_BRIDGE_CERTIFICATE,
		context: 'MQTT',
	},
	NRFCLOUD_BRIDGE_CERTIFICATE_CA: <ScopeContext>{
		scope: Scopes.NRFCLOUD_BRIDGE_CERTIFICATE,
		context: 'CA',
	},
	STACK_FEEDBACK: <ScopeContext>{
		scope: Scopes.STACK,
		context: 'feedback',
	},
} as const
