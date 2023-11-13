import type { PackedLambda } from './helpers/lambdas/packLambda'

type MapBackendLambdas = {
	updatesToLwM2M: PackedLambda
	shareDevice: PackedLambda
	confirmOwnership: PackedLambda
	connectionInformationGeoLocation: PackedLambda
	devicesData: PackedLambda
}
