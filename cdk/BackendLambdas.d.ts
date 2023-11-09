import type { PackedLambda } from './helpers/lambdas/packLambda'

type BackendLambdas = {
	authorizer: PackedLambda
	onConnect: PackedLambda
	onMessage: PackedLambda
	onDisconnect: PackedLambda
	publishToWebsocketClients: PackedLambda
	prepareDeviceShadow: PackedLambda
	fetchDeviceShadow: PackedLambda
	onDeviceMessage: PackedLambda
	storeMessagesInTimestream: PackedLambda
	healthCheck: PackedLambda
	healthCheckForCoAP: PackedLambda
	historicalDataRequest: PackedLambda
	kpis: PackedLambda
	configureDevice: PackedLambda
	resolveSingleCellGeoLocation: PackedLambda
	// Map
	updatesToLwM2M: PackedLambda
	iotRulePublicDeviceCheck: PackedLambda
}
