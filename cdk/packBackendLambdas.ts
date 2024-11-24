import {
	packLambdaFromPath,
	type PackedLambda,
} from '@bifravst/aws-cdk-lambda-helpers'
import path from 'node:path'
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
		abort: PackedLambda
		onFail: PackedLambda
		getDeviceFirmwareDetails: PackedLambda
		getNextBundle: PackedLambda
		createFOTAJob: PackedLambda
		cancelFOTAJob: PackedLambda
		WaitForFOTAJobCompletionCallback: PackedLambda
		waitForFOTAJobCompletion: PackedLambda
		waitForUpdateAppliedCallback: PackedLambda
		WaitForUpdateApplied: PackedLambda
	}
}

const pack = async (id: string) =>
	packLambdaFromPath({ id, sourceFilePath: path.join(`lambda`, `${id}.ts`) })

const packFromFolder =
	(folder: string) =>
	async (id: string, lambda = id) =>
		packLambdaFromPath({
			id,
			sourceFilePath: path.join(`lambda`, folder, `${lambda}.ts`),
		})

const packLocationHistory = packFromFolder('location-history')
const packFOTA = packFromFolder('fota')
const packMultiBundleFOTA = packFromFolder('fota/multi-bundle-flow')
const packMemfault = packFromFolder('memfault')

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
	scheduleFetchLocationHistory: await packLocationHistory(
		'scheduleFetchLocationHistory',
	),
	fetchLocationHistory: await packLocationHistory('fetchLocationHistory'),
	queryLocationHistory: await packLocationHistory('queryLocationHistory'),
	scheduleFOTAJobStatusUpdate: await packFOTA('scheduleFOTAJobStatusUpdate'),
	getFOTAJobStatus: await packFOTA('getFOTAJobStatus'),
	updateFOTAJobStatus: await packFOTA('updateFOTAJobStatus'),
	notifyFOTAJobStatus: await packFOTA('notifyFOTAJobStatus'),
	listFOTABundles: await packFOTA('listFOTABundles'),
	scheduleFetchMemfaultReboots: await packMemfault(
		'scheduleFetchMemfaultReboots',
		'scheduleFetchReboots',
	),
	fetchMemfaultReboots: await packMemfault(
		'fetchMemfaultReboots',
		'fetchReboots',
	),
	queryMemfaultReboots: await packMemfault(
		'queryMemfaultReboots',
		'queryReboots',
	),
	hideDataBefore: await pack('hideDataBefore'),
	createCNAMERecord: await packLambdaFromPath({
		id: 'createCNAMERecord',
		sourceFilePath: 'cdk/resources/api/createCNAMERecord.ts',
	}),
	multiBundleFOTAFlow: {
		start: await packMultiBundleFOTA('multiBundleFOTAFlowStart', 'start'),
		abort: await packMultiBundleFOTA('multiBundleFOTAFlowAbort', 'abort'),
		onFail: await packMultiBundleFOTA('multiBundleFOTAFlowOnFail', 'onFail'),
		getDeviceFirmwareDetails: await packMultiBundleFOTA(
			'multiBundleFOTAFlowGetDeviceFirmareDetails',
			'getDeviceFirmwareDetails',
		),
		getNextBundle: await packMultiBundleFOTA(
			'multiBundleFOTAFlowGetNextBundle',
			'getNextBundle',
		),
		createFOTAJob: await packMultiBundleFOTA(
			'multiBundleFOTAFlowCreateFOTAJob',
			'createFOTAJob',
		),
		cancelFOTAJob: await packMultiBundleFOTA(
			'multiBundleFOTAFlowCancelFOTAJob',
			'cancelFOTAJob',
		),
		WaitForFOTAJobCompletionCallback: await packMultiBundleFOTA(
			'multiBundleFOTAFlowWaitForFOTAJobCompletionCallback',
			'waitForFOTAJobCompletionCallback',
		),
		waitForFOTAJobCompletion: await packMultiBundleFOTA(
			'multiBundleFOTAFlowWaitForFOTAJobCompletion',
			'waitForFOTAJobCompletion',
		),
		waitForUpdateAppliedCallback: await packMultiBundleFOTA(
			'multiBundleFOTAFlowWaitForUpdateAppliedCallback',
			'waitForUpdateAppliedCallback',
		),
		WaitForUpdateApplied: await packMultiBundleFOTA(
			'multiBundleFOTAFlowWaitForUpdateApplied',
			'waitForUpdateApplied',
		),
	},
})
