import {
	packLambdaFromPath,
	type PackedLambda,
} from '@bifravst/aws-cdk-lambda-helpers'
import { packGo } from './helpers/lambda/packGo.js'

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
	updateDeviceState: PackedLambda
	getDeviceByFingerprint: PackedLambda
	feedback: PackedLambda
	storeObjectsInTimestream: PackedLambda
	queryLwM2MHistory: PackedLambda
	apiHealthCheck: PackedLambda
	onNrfCloudDeviceMessage: PackedLambda
	scheduleFetchLocationHistory: PackedLambda
	fetchLocationHistory: PackedLambda
	queryLocationHistory: PackedLambda
	getFOTAJobStatus: PackedLambda
	scheduleFOTAJobStatusUpdate: PackedLambda
	updateFOTAJobStatus: PackedLambda
	notifyFOTAJobStatus: PackedLambda
	listFOTABundles: PackedLambda
	scheduleFetchMemfaultReboots: PackedLambda
	fetchMemfaultReboots: PackedLambda
	queryMemfaultReboots: PackedLambda
	hideDataBefore: PackedLambda
	createCNAMERecord: PackedLambda
	multiBundleFOTAFlow: {
		start: PackedLambda
		getDeviceFirmwareDetails: PackedLambda
		getNextBundle: PackedLambda
		createFOTAJob: PackedLambda
		WaitForFOTAJobCompletionCallback: PackedLambda
		waitForFOTAJobCompletion: PackedLambda
		waitForUpdateAppliedCallback: PackedLambda
	}
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
	updateDeviceState: await pack('updateDeviceState'),
	getDeviceByFingerprint: await pack('getDeviceByFingerprint'),
	feedback: await pack('feedback'),
	storeObjectsInTimestream: await pack('storeObjectsInTimestream'),
	queryLwM2MHistory: await pack('queryLwM2MHistory'),
	apiHealthCheck: await pack('apiHealthCheck'),
	onNrfCloudDeviceMessage: await pack('onNrfCloudDeviceMessage'),
	scheduleFetchLocationHistory: await packLambdaFromPath(
		'scheduleFetchLocationHistory',
		'lambda/location-history/scheduleFetchLocationHistory.ts',
	),
	fetchLocationHistory: await packLambdaFromPath(
		'fetchLocationHistory',
		'lambda/location-history/fetchLocationHistory.ts',
	),
	queryLocationHistory: await packLambdaFromPath(
		'queryLocationHistory',
		'lambda/location-history/queryLocationHistory.ts',
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
	scheduleFetchMemfaultReboots: await packLambdaFromPath(
		'scheduleFetchMemfaultReboots',
		'lambda/memfault/scheduleFetchReboots.ts',
	),
	fetchMemfaultReboots: await packLambdaFromPath(
		'fetchMemfaultReboots',
		'lambda/memfault/fetchReboots.ts',
	),
	queryMemfaultReboots: await packLambdaFromPath(
		'queryMemfaultReboots',
		'lambda/memfault/queryReboots.ts',
	),
	hideDataBefore: await pack('hideDataBefore'),
	createCNAMERecord: await packLambdaFromPath(
		'createCNAMERecord',
		'cdk/resources/api/createCNAMERecord.ts',
	),
	multiBundleFOTAFlow: {
		start: await packLambdaFromPath(
			'multiBundleFOTAFlowStart',
			'lambda/fota/multi-bundle-flow/start.ts',
		),
		getDeviceFirmwareDetails: await packLambdaFromPath(
			'multiBundleFOTAFlowGetDeviceFirmareDetails',
			'lambda/fota/multi-bundle-flow/getDeviceFirmwareDetails.ts',
		),
		getNextBundle: await packLambdaFromPath(
			'multiBundleFOTAFlowGetNextBundle',
			'lambda/fota/multi-bundle-flow/getNextBundle.ts',
		),
		createFOTAJob: await packLambdaFromPath(
			'multiBundleFOTAFlowCreateFOTAJob',
			'lambda/fota/multi-bundle-flow/createFOTAJob.ts',
		),
		WaitForFOTAJobCompletionCallback: await packLambdaFromPath(
			'multiBundleFOTAFlowWaitForFOTAJobCompletionCallback',
			'lambda/fota/multi-bundle-flow/waitForFOTAJobCompletionCallback.ts',
		),
		waitForFOTAJobCompletion: await packLambdaFromPath(
			'multiBundleFOTAFlowWaitForFOTAJobCompletion',
			'lambda/fota/multi-bundle-flow/waitForFOTAJobCompletion.ts',
		),
		waitForUpdateAppliedCallback: await packLambdaFromPath(
			'multiBundleFOTAFlowWaitForUpdateAppliedCallback',
			'lambda/fota/multi-bundle-flow/waitForUpdateAppliedCallback.ts',
		),
	},
})
