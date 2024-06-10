import { PackedLambdaFn } from '@bifravst/aws-cdk-lambda-helpers/cdk'
import type {
	aws_dynamodb as DynamoDB,
	aws_lambda as Lambda,
} from 'aws-cdk-lib'
import { Duration } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import type { BackendLambdas } from '../packBackendLambdas.js'
import type { DeviceStorage } from './DeviceStorage.js'

/**
 * Provides the lambda function to access the import logs
 */
export class SenMLImportLogs extends Construct {
	public readonly fn: PackedLambdaFn
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

		this.fn = new PackedLambdaFn(this, 'fn', lambdaSources.senMLImportLogs, {
			timeout: Duration.minutes(1),
			description: 'Returns the last senML import results for a device.',
			layers,
			environment: {
				IMPORT_LOGS_TABLE_NAME: importLogsTable.tableName,
				DEVICES_TABLE_NAME: deviceStorage.devicesTable.tableName,
				DEVICES_INDEX_NAME: deviceStorage.devicesTableFingerprintIndexName,
			},
		})
		importLogsTable.grantReadData(this.fn.fn)
		deviceStorage.devicesTable.grantReadData(this.fn.fn)
	}
}
