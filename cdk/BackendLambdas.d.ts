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
	kpis: PackedLambda
}
