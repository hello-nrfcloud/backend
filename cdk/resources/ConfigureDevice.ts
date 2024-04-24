import { PackedLambdaFn } from '@bifravst/aws-cdk-lambda-helpers/cdk'
import { aws_lambda as Lambda } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import type { BackendLambdas } from '../packBackendLambdas.js'
import type { DeviceStorage } from './DeviceStorage.js'

/**
 * Handles device configuration requests
 */
export class ConfigureDevice extends Construct {
	public readonly fn: Lambda.Function
	public constructor(
		parent: Construct,
		{
			lambdaSources,
			layers,
			deviceStorage,
		}: {
			lambdaSources: Pick<BackendLambdas, 'configureDevice'>
			layers: Lambda.ILayerVersion[]
			deviceStorage: DeviceStorage
		},
	) {
		super(parent, 'configureDevice')

		this.fn = new PackedLambdaFn(
			this,
			'configureDevice',
			lambdaSources.configureDevice,
			{
				description: 'Handle device configuration request',
				environment: {
					DEVICES_TABLE_NAME: deviceStorage.devicesTable.tableName,
					DEVICES_INDEX_NAME: deviceStorage.devicesTableFingerprintIndexName,
				},
				layers,
			},
		).fn
		deviceStorage.devicesTable.grantReadData(this.fn)
	}
}
