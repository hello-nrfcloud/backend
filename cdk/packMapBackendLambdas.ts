import type { MapBackendLambdas } from './MapBackendLambdas.js'
import { packLambdaFromPath } from '@bifravst/aws-cdk-lambda-helpers'

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
	createCredentials: await packLambdaFromPath(
		'createCredentials',
		'lambda/map/createCredentials.ts',
	),
	openSSL: await packLambdaFromPath('openSSL', 'lambda/map/openSSL.ts'),
	senMLToLwM2M: await packLambdaFromPath(
		'senMLToLwM2M',
		'lambda/map/senMLToLwM2M.ts',
	),
})
