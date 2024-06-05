import { PackedLambdaFn } from '@bifravst/aws-cdk-lambda-helpers/cdk'
import type { aws_lambda as Lambda } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import type { BackendLambdas } from '../packBackendLambdas.js'
import type { DeviceStorage } from './DeviceStorage.js'

/**
 * Schedules FOTA jobs for devices
 */
export class DeviceFOTA extends Construct {
	public readonly fn: Lambda.Function
	public constructor(
		parent: Construct,
		{
			lambdaSources,
			layers,
			deviceStorage,
		}: {
			lambdaSources: Pick<BackendLambdas, 'deviceFOTA'>
			layers: Lambda.ILayerVersion[]
			deviceStorage: DeviceStorage
		},
	) {
		super(parent, 'DeviceFOTA')

		this.fn = new PackedLambdaFn(this, 'schedule', lambdaSources.deviceFOTA, {
			description: 'Schedule device FOTA jobs',
			environment: {
				DEVICES_TABLE_NAME: deviceStorage.devicesTable.tableName,
			},
			layers,
		}).fn
		deviceStorage.devicesTable.grantReadData(this.fn)
	}
}
