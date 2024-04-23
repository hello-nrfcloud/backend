import { LambdaLogGroup } from '@bifravst/aws-cdk-lambda-helpers/cdk'
import {
	Duration,
	aws_lambda as Lambda,
	aws_dynamodb as DynamoDB,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import type { BackendLambdas } from '../packBackendLambdas.js'
import type { DeviceStorage } from './DeviceStorage.js'

/**
 * Provides the lambda function to access the import logs
 */
export class SenMLImportLogs extends Construct {
	public readonly fn: Lambda.IFunction
	constructor(
		parent: Construct,
		{
			deviceStorage,
			layers,
			lambdaSources,
			importLogsTable,
		}: {
			deviceStorage: DeviceStorage
			layers: Array<Lambda.ILayerVersion>
			lambdaSources: Pick<BackendLambdas, 'senMLImportLogs'>
			importLogsTable: DynamoDB.ITable
		},
	) {
		super(parent, 'senml-import-logs')

		this.fn = new Lambda.Function(this, 'fn', {
			handler: lambdaSources.senMLImportLogs.handler,
			architecture: Lambda.Architecture.ARM_64,
			runtime: Lambda.Runtime.NODEJS_20_X,
			timeout: Duration.minutes(1),
			memorySize: 1792,
			code: Lambda.Code.fromAsset(lambdaSources.senMLImportLogs.zipFile),
			description: 'Returns the last senML import results for a device.',
			layers,
			environment: {
				VERSION: this.node.getContext('version'),
				IMPORT_LOGS_TABLE_NAME: importLogsTable.tableName,
				DEVICES_TABLE_NAME: deviceStorage.devicesTable.tableName,
				DEVICES_INDEX_NAME: deviceStorage.devicesTableFingerprintIndexName,
				DISABLE_METRICS: this.node.getContext('isTest') === true ? '1' : '0',
			},
			...new LambdaLogGroup(this, 'fnLogs'),
		})
		importLogsTable.grantReadData(this.fn)
		deviceStorage.devicesTable.grantReadData(this.fn)
	}
}
