import {
	packLambdaFromPath,
	type PackedLambda,
} from '@bifravst/aws-cdk-lambda-helpers'
import { packGo } from './helpers/certificates/lambda/packGo.js'

export type BackendLambdas = {
	authorizer: PackedLambda
	onConnect: PackedLambda
	onMessage: PackedLambda
	onDisconnect: PackedLambda
	publishToWebsocketClients: PackedLambda
	prepareDeviceShadow: PackedLambda
	fetchDeviceShadow: PackedLambda
	publishShadowUpdatesToWebsocket: PackedLambda
	onLwM2MUpdate: PackedLambda
	senMLImportLogs: PackedLambda
	healthCheck: PackedLambda
	healthCheckForCoAP: PackedLambda
	healthCheckForCoAPClient: PackedLambda
	kpis: PackedLambda
	configureDevice: PackedLambda
	getDeviceByFingerprint: PackedLambda
	feedback: PackedLambda
	storeObjectsInTimestream: PackedLambda
	queryLwM2MHistory: PackedLambda
	apiHealthCheck: PackedLambda
	onNrfCloudDeviceMessage: PackedLambda
	scheduleLocationFetchHistory: PackedLambda
	fetchLocationHistory: PackedLambda
	scheduleFOTAJob: PackedLambda
	getFOTAJobStatus: PackedLambda
	scheduleFOTAJobStatusUpdate: PackedLambda
	updateFOTAJobStatus: PackedLambda
	notifyFOTAJobStatus: PackedLambda
	listFOTABundles: PackedLambda
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
	publishShadowUpdatesToWebsocket: await pack(
		'publishShadowUpdatesToWebsocket',
	),
	onLwM2MUpdate: await pack('onLwM2MUpdate'),
	senMLImportLogs: await pack('senMLImportLogs'),
	healthCheck: await pack('healthCheck'),
	healthCheckForCoAP: await pack('healthCheckForCoAP'),
	healthCheckForCoAPClient: await packGo(
		'healthCheckForCoAPClient',
		'lambda/health-check/coap/client',
	),
	kpis: await pack('kpis'),
	configureDevice: await pack('configureDevice'),
	getDeviceByFingerprint: await pack('getDeviceByFingerprint'),
	feedback: await pack('feedback'),
	storeObjectsInTimestream: await pack('storeObjectsInTimestream'),
	queryLwM2MHistory: await pack('queryLwM2MHistory'),
	apiHealthCheck: await pack('apiHealthCheck'),
	onNrfCloudDeviceMessage: await pack('onNrfCloudDeviceMessage'),
	scheduleLocationFetchHistory: await pack('scheduleLocationFetchHistory'),
	fetchLocationHistory: await pack('fetchLocationHistory'),
	scheduleFOTAJob: await packLambdaFromPath(
		'scheduleFOTAJob',
		`lambda/fota/scheduleFOTAJob.ts`,
	),
	scheduleFOTAJobStatusUpdate: await packLambdaFromPath(
		'scheduleFOTAJobStatusUpdate',
		`lambda/fota/scheduleFOTAJobStatusUpdate.ts`,
	),
	getFOTAJobStatus: await packLambdaFromPath(
		'getFOTAJobStatus',
		`lambda/fota/getFOTAJobStatus.ts`,
	),
	updateFOTAJobStatus: await packLambdaFromPath(
		'updateFOTAJobStatus',
		`lambda/fota/updateFOTAJobStatus.ts`,
	),
	notifyFOTAJobStatus: await packLambdaFromPath(
		'notifyFOTAJobStatus',
		`lambda/fota/notifyFOTAJobStatus.ts`,
	),
	listFOTABundles: await packLambdaFromPath(
		'listFOTABundles',
		`lambda/fota/listFOTABundles.ts`,
	),
})
