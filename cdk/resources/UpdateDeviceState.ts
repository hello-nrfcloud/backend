import { PackedLambdaFn } from '@bifravst/aws-cdk-lambda-helpers/cdk'
import type { aws_lambda as Lambda } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import type { BackendLambdas } from '../packBackendLambdas.js'
import type { DeviceStorage } from './DeviceStorage.js'

/**
 * Handles device state updates
 */
export class UpdateDeviceState extends Construct {
	public readonly fn: PackedLambdaFn
	public constructor(
		parent: Construct,
		{
			lambdaSources,
			layers,
			deviceStorage,
		}: {
			lambdaSources: Pick<BackendLambdas, 'updateDeviceState'>
			layers: Lambda.ILayerVersion[]
			deviceStorage: DeviceStorage
		},
	) {
		super(parent, 'updateDeviceState')

		this.fn = new PackedLambdaFn(
			this,
			'updateDeviceState',
			lambdaSources.updateDeviceState,
			{
				description: 'Handles device state updates',
				environment: {
					DEVICES_TABLE_NAME: deviceStorage.devicesTable.tableName,
				},
				layers,
			},
		)
		deviceStorage.devicesTable.grantReadData(this.fn.fn)
	}
}
