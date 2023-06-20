import type { BackendLambdas } from './BackendLambdas.js'
import { packLambdaFromPath } from './helpers/lambdas/packLambdaFromPath.js'

export const packBackendLambdas = async (): Promise<BackendLambdas> => ({
	onConnect: await packLambdaFromPath('onConnect', 'lambda/onConnect.ts'),
	onDisconnect: await packLambdaFromPath(
		'onDisconnect',
		'lambda/onDisconnect.ts',
	),
	publishToWebsocketClients: await packLambdaFromPath(
		'publishToWebsocketClients',
		'lambda/publishToWebsocketClients.ts',
	),
	prepareDeviceShadow: await packLambdaFromPath(
		'prepareDeviceShadow',
		'lambda/prepareDeviceShadow.ts',
	),
	fetchDeviceShadow: await packLambdaFromPath(
		'fetchDeviceShadow',
		'lambda/fetchDeviceShadow.ts',
	),
	onDeviceMessage: await packLambdaFromPath(
		'onDeviceMessage',
		'lambda/onDeviceMessage.ts',
	),
	onWebsocketConnectOrDisconnect: await packLambdaFromPath(
		'onWebsocketConnectOrDisconnect',
		'lambda/onWebsocketConnectOrDisconnect.ts',
	),
	storeMessagesInTimestream: await packLambdaFromPath(
		'storeMessagesInTimestream',
		'lambda/storeMessagesInTimestream.ts',
	),
})
