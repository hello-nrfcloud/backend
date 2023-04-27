import type { PackedLambda } from './backend'

type BackendLambdas = {
	onConnect: PackedLambda
	onMessage: PackedLambda
	onDisconnect: PackedLambda
	publishToWebsocketClients: PackedLambda
	prepareDeviceShadow: PackedLambda
	fetchDeviceShadow: PackedLambda
	onDeviceMessage: PackedLambda
	onDeviceConnectOrDisconnect: PackedLambda
}
