import type { BackendLambdas } from './BackendLambdas.js'
import { packLambdaFromPath } from './helpers/lambdas/packLambdaFromPath.js'

export const packBackendLambdas = async (): Promise<BackendLambdas> => ({
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
	prepareDeviceShadow: await packLambdaFromPath(
		'prepareDeviceShadow',
		'lambda/prepareDeviceShadow.ts',
	),
	fetchDeviceShadow: await packLambdaFromPath(
		'fetchDeviceShadow',
		'lambda/fetchDeviceShadow.ts',
	),
})
