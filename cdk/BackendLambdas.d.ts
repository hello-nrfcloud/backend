import type { PackedLambda } from './helpers/lambdas/packLambda'

type BackendLambdas = {
	onConnect: PackedLambda
	onDisconnect: PackedLambda
	publishToWebsocketClients: PackedLambda
	prepareDeviceShadow: PackedLambda
	fetchDeviceShadow: PackedLambda
	onDeviceMessage: PackedLambda
	onWebsocketConnectOrDisconnect: PackedLambda
	storeMessagesInTimestream: PackedLambda
}
