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
})
