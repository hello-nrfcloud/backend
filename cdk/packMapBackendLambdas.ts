import type { MapBackendLambdas } from './MapBackendLambdas.js'
import { packLambdaFromPath } from './helpers/lambdas/packLambdaFromPath.js'

export const packMapBackendLambdas = async (): Promise<MapBackendLambdas> => ({
	updatesToLwM2M: await packLambdaFromPath(
		'updatesToLwM2M',
		'lambda/map/updatesToLwM2M.ts',
	),
	shareDevice: await packLambdaFromPath(
		'shareDevice',
		'lambda/map/shareDevice.ts',
	),
	sharingStatus: await packLambdaFromPath(
		'sharingStatus',
		'lambda/map/sharingStatus.ts',
	),
	confirmOwnership: await packLambdaFromPath(
		'confirmOwnership',
		'lambda/map/confirmOwnership.ts',
	),
	connectionInformationGeoLocation: await packLambdaFromPath(
		'connectionInformationGeoLocation',
		'lambda/map/connectionInformationGeoLocation.ts',
	),
	devicesData: await packLambdaFromPath(
		'devicesData',
		'lambda/map/devicesData.ts',
	),
	storeObjectsInTimestream: await packLambdaFromPath(
		'storeObjectsInTimestream',
		'lambda/map/storeObjectsInTimestream.ts',
	),
	queryHistory: await packLambdaFromPath(
		'queryHistory',
		'lambda/map/queryHistory.ts',
	),
})
