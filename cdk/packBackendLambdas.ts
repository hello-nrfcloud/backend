import type { BackendLambdas } from './BackendLambdas.js'
import { packLambdaFromPath } from './helpers/lambdas/packLambdaFromPath.js'

export const packBackendLambdas = async (): Promise<BackendLambdas> => ({
	authorizer: await packLambdaFromPath('authorizer', 'lambda/authorizer.ts'),
	onConnect: await packLambdaFromPath('onConnect', 'lambda/onConnect.ts'),
	onMessage: await packLambdaFromPath('onMessage', 'lambda/onMessage.ts'),
	onDisconnect: await packLambdaFromPath(
		'onDisconnect',
		'lambda/onDisconnect.ts',
	),
	publishToWebsocketClients: await packLambdaFromPath(
		'publishToWebsocketClients',
		'lambda/publishToWebsocketClients.ts',
	),
	onDeviceMessage: await packLambdaFromPath(
		'onDeviceMessage',
		'lambda/onDeviceMessage.ts',
	),
	storeMessagesInTimestream: await packLambdaFromPath(
		'storeMessagesInTimestream',
		'lambda/storeMessagesInTimestream.ts',
	),
	healthCheck: await packLambdaFromPath('healthCheck', 'lambda/healthCheck.ts'),
	healthCheckForCoAP: await packLambdaFromPath(
		'healthCheckForCoAP',
		'lambda/healthCheckForCoAP.ts',
	),
	historicalDataRequest: await packLambdaFromPath(
		'historicalDataRequest',
		'lambda/historicalDataRequest.ts',
	),
	kpis: await packLambdaFromPath('kpis', 'lambda/kpis.ts'),
	configureDevice: await packLambdaFromPath(
		'configureDevice',
		'lambda/configureDevice.ts',
	),
	resolveSingleCellGeoLocation: await packLambdaFromPath(
		'resolveSingleCellGeoLocation',
		'lambda/resolveSingleCellGeoLocation.ts',
	),
})
