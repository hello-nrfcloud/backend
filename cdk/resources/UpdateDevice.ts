import { PackedLambdaFn } from '@bifravst/aws-cdk-lambda-helpers/cdk'
import type { aws_lambda as Lambda } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import type { BackendLambdas } from '../packBackendLambdas.js'
import type { DeviceStorage } from './DeviceStorage.js'

/**
 * Handles device updates
 */
export class UpdateDevice extends Construct {
	public readonly hideDataBeforeFn: PackedLambdaFn
	public constructor(
		parent: Construct,
		{
			lambdaSources,
			layers,
			deviceStorage,
		}: {
			lambdaSources: Pick<BackendLambdas, 'hideDataBefore'>
			layers: Lambda.ILayerVersion[]
			deviceStorage: DeviceStorage
		},
	) {
		super(parent, 'UpdateDevice')

		this.hideDataBeforeFn = new PackedLambdaFn(
			this,
			'hideDataBefore',
			lambdaSources.hideDataBefore,
			{
				description: 'Handles device updates',
				environment: {
					DEVICES_TABLE_NAME: deviceStorage.devicesTable.tableName,
				},
				layers,
			},
		)
		deviceStorage.devicesTable.grantReadWriteData(this.hideDataBeforeFn.fn)
	}
}
