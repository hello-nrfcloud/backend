import {
	Duration,
	aws_events_targets as EventTargets,
	aws_events as Events,
	aws_iam as IAM,
	aws_lambda as Lambda,
	RemovalPolicy,
	aws_timestream as Timestream,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import type { PackedLambda } from '../helpers/lambdas/packLambda.js'
import { LambdaLogGroup } from './LambdaLogGroup.js'
import type { WebsocketAPI } from './WebsocketAPI.js'

/**
 * Store devices messages in their converted format
 */
export class HistoricalData extends Construct {
	public readonly table: Timestream.CfnTable
	public constructor(
		parent: Construct,
		{
			lambdaSources,
			layers,
			websocketAPI,
		}: {
			websocketAPI: WebsocketAPI
			lambdaSources: {
				storeMessagesInTimestream: PackedLambda
			}
			layers: Lambda.ILayerVersion[]
		},
	) {
		super(parent, 'historicalData')

		const db = new Timestream.CfnDatabase(this, 'historicalData')
		this.table = new Timestream.CfnTable(this, 'historicalDataTable', {
			databaseName: db.ref,
			retentionProperties: {
				MemoryStoreRetentionPeriodInHours: '24',
				MagneticStoreRetentionPeriodInDays: '365',
			},
		})

		db.applyRemovalPolicy(
			this.node.tryGetContext('isTest') === true
				? RemovalPolicy.DESTROY
				: RemovalPolicy.RETAIN,
		)

		const storeMessagesInTimestream = new Lambda.Function(
			this,
			'storeMessagesInTimestream',
			{
				handler: lambdaSources.storeMessagesInTimestream.handler,
				architecture: Lambda.Architecture.ARM_64,
				runtime: Lambda.Runtime.NODEJS_18_X,
				timeout: Duration.seconds(5),
				memorySize: 1792,
				code: Lambda.Code.fromAsset(
					lambdaSources.storeMessagesInTimestream.zipFile,
				),
				description: 'Save converted messages into Timestream database',
				environment: {
					VERSION: this.node.tryGetContext('version'),
					LOG_LEVEL: this.node.tryGetContext('logLevel'),
					HISTORICAL_DATA_TABLE_INFO: this.table.ref,
					NODE_NO_WARNINGS: '1',
				},
				layers,
				initialPolicy: [
					new IAM.PolicyStatement({
						actions: ['timestream:WriteRecords'],
						resources: [this.table.attrArn],
					}),
					new IAM.PolicyStatement({
						actions: ['timestream:DescribeEndpoints'],
						resources: ['*'],
					}),
				],
			},
		)
		new LambdaLogGroup(
			this,
			'storeMessagesInTimestreamLogs',
			storeMessagesInTimestream,
		)
		new Events.Rule(this, 'messagesRule', {
			eventPattern: {
				source: ['thingy.ws'],
				detailType: ['message'],
			},
			targets: [new EventTargets.LambdaFunction(storeMessagesInTimestream)],
			eventBus: websocketAPI.eventBus,
		})
	}
}
