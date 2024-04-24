import { PackedLambdaFn } from '@bifravst/aws-cdk-lambda-helpers/cdk'
import { aws_lambda as Lambda } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import type { BackendLambdas } from '../packBackendLambdas.js'
import type { DeviceStorage } from './DeviceStorage.js'

export class DeviceInfo extends Construct {
	public readonly fn: Lambda.IFunction
	constructor(
		parent: Construct,
		{
			deviceStorage,
			lambdaSources,
			layers,
		}: {
			deviceStorage: DeviceStorage
			lambdaSources: Pick<BackendLambdas, 'getDeviceByFingerprint'>
			layers: Lambda.ILayerVersion[]
		},
	) {
		super(parent, 'device-info')

		this.fn = new PackedLambdaFn(
			this,
			'getDeviceByFingerprintFn',
			lambdaSources.getDeviceByFingerprint,
			{
				description:
					'Returns information for a device identified by the fingerprint.',
				layers,
				environment: {
					DEVICES_TABLE_NAME: deviceStorage.devicesTable.tableName,
					DEVICES_INDEX_NAME: deviceStorage.devicesTableFingerprintIndexName,
				},
			},
		).fn
		deviceStorage.devicesTable.grantReadData(this.fn)
	}
}
