import { LambdaLogGroup } from '@bifravst/aws-cdk-lambda-helpers/cdk'
import { Duration, aws_lambda as Lambda } from 'aws-cdk-lib'
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

		this.fn = new Lambda.Function(this, 'getDeviceByFingerprintFn', {
			handler: lambdaSources.getDeviceByFingerprint.handler,
			architecture: Lambda.Architecture.ARM_64,
			runtime: Lambda.Runtime.NODEJS_20_X,
			timeout: Duration.seconds(1),
			memorySize: 1792,
			code: Lambda.Code.fromAsset(lambdaSources.getDeviceByFingerprint.zipFile),
			description:
				'Returns information for a device identified by the fingerprint.',
			layers,
			environment: {
				VERSION: this.node.getContext('version'),
				DEVICES_TABLE_NAME: deviceStorage.devicesTable.tableName,
				DEVICES_INDEX_NAME: deviceStorage.devicesTableFingerprintIndexName,
				NODE_NO_WARNINGS: '1',
				DISABLE_METRICS: this.node.getContext('isTest') === true ? '1' : '0',
			},
			...new LambdaLogGroup(this, 'getDeviceByFingerprintFnLogs'),
		})
		deviceStorage.devicesTable.grantReadData(this.fn)
	}
}
