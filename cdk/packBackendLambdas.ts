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
	onLwM2MUpdate: PackedLambda
	senMLImportLogs: PackedLambda
	healthCheck: PackedLambda
	healthCheckForCoAP: PackedLambda
	kpis: PackedLambda
	configureDevice: PackedLambda
	getDeviceByFingerprint: PackedLambda
	feedback: PackedLambda
	connectionInformationGeoLocation: PackedLambda
	storeObjectsInTimestream: PackedLambda
	queryLwM2MHistory: PackedLambda
	apiHealthCheck: PackedLambda
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
	onLwM2MUpdate: await pack('onLwM2MUpdate'),
	senMLImportLogs: await pack('senMLImportLogs'),
	healthCheck: await pack('healthCheck'),
	healthCheckForCoAP: await pack('healthCheckForCoAP'),
	kpis: await pack('kpis'),
	configureDevice: await pack('configureDevice'),
	getDeviceByFingerprint: await pack('getDeviceByFingerprint'),
	feedback: await pack('feedback'),
	connectionInformationGeoLocation: await pack(
		'connectionInformationGeoLocation',
	),
	storeObjectsInTimestream: await pack('storeObjectsInTimestream'),
	queryLwM2MHistory: await pack('queryLwM2MHistory'),
	apiHealthCheck: await pack('apiHealthCheck'),
})
