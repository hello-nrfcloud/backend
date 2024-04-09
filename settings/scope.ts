export enum Scopes {
	STACK = 'stack',
	NRFCLOUD_BRIDGE_CERTIFICATE = 'nRFCloudBridgeCertificate',
	NRFCLOUD_ACCOUNT_PREFIX = 'thirdParty',
}

export type ScopeContext = {
	scope: string
	context: string
}

export const ScopeContexts = {
	STACK_CONFIG: <ScopeContext>{ scope: Scopes.STACK, context: 'context' },
	STACK_MQTT_BRIDGE: <ScopeContext>{
		scope: Scopes.STACK,
		context: 'mqttBridge',
	},
	STACK_COAP_HEALTH_CHECK: <ScopeContext>{
		scope: Scopes.STACK,
		context: 'coap-health-check',
	},
	NRFCLOUD_BRIDGE_CERTIFICATE_MQTT: <ScopeContext>{
		scope: Scopes.NRFCLOUD_BRIDGE_CERTIFICATE,
		context: 'MQTT',
	},
	NRFCLOUD_BRIDGE_CERTIFICATE_CA: <ScopeContext>{
		scope: Scopes.NRFCLOUD_BRIDGE_CERTIFICATE,
		context: 'CA',
	},
} as const

const nameRx = /^[a-zA-Z0-9_.-]+$/

export const nrfCloudAccount = (account: string): ScopeContext => {
	if (!nameRx.test(account)) throw new Error(`Invalid account name: ${account}`)
	return {
		scope: Scopes.NRFCLOUD_ACCOUNT_PREFIX,
		context: account,
	}
}
