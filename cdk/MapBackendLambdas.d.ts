import type { PackedLambda } from './helpers/lambdas/packLambda'

type MapBackendLambdas = {
	updatesToLwM2M: PackedLambda
	shareDevice: PackedLambda
	sharingStatus: PackedLambda
	confirmOwnership: PackedLambda
	connectionInformationGeoLocation: PackedLambda
	devicesData: PackedLambda
	storeObjectsInTimestream: PackedLambda
	queryHistory: PackedLambda
	createCredentials: PackedLambda
	openSSL: PackedLambda
	senMLToLwM2M: PackedLambda
}
