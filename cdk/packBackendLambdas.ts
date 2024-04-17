import {
	packLambdaFromPath,
	type PackedLambda,
} from '@bifravst/aws-cdk-lambda-helpers'

export type BackendLambdas = {
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
	getDeviceByFingerprint: PackedLambda
}

const pack = async (id: string) => packLambdaFromPath(id, `lambda/${id}.ts`)

export const packBackendLambdas = async (): Promise<BackendLambdas> => ({
	authorizer: await pack('authorizer'),
	onConnect: await pack('onConnect'),
	onMessage: await pack('onMessage'),
	onDisconnect: await pack('onDisconnect'),
	publishToWebsocketClients: await pack('publishToWebsocketClients'),
	prepareDeviceShadow: await pack('prepareDeviceShadow'),
	fetchDeviceShadow: await pack('fetchDeviceShadow'),
	onDeviceMessage: await pack('onDeviceMessage'),
	storeMessagesInTimestream: await pack('storeMessagesInTimestream'),
	healthCheck: await pack('healthCheck'),
	healthCheckForCoAP: await pack('healthCheckForCoAP'),
	historicalDataRequest: await pack('historicalDataRequest'),
	kpis: await pack('kpis'),
	configureDevice: await pack('configureDevice'),
	resolveSingleCellGeoLocation: await pack('resolveSingleCellGeoLocation'),
	getDeviceByFingerprint: await pack('getDeviceByFingerprint'),
})
