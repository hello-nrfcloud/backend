import {
	Duration,
	aws_events_targets as EventTargets,
	aws_events as Events,
	aws_iam as IAM,
	aws_lambda as Lambda,
	aws_logs as Logs,
	RemovalPolicy,
	aws_timestream as Timestream,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import type { PackedLambda } from '../helpers/lambdas/packLambda.js'
import { LambdaSource } from './LambdaSource.js'
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
				historicalDataRequest: PackedLambda
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
				code: new LambdaSource(this, lambdaSources.storeMessagesInTimestream)
					.code,
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
				logRetention: Logs.RetentionDays.ONE_WEEK,
			},
		)
		new Events.Rule(this, 'messagesRule', {
			eventPattern: {
				source: ['thingy.ws'],
				detailType: ['message'],
			},
			targets: [new EventTargets.LambdaFunction(storeMessagesInTimestream)],
			eventBus: websocketAPI.eventBus,
		})

		const historicalDataRequest = new Lambda.Function(
			this,
			'historicalDataRequest',
			{
				handler: lambdaSources.historicalDataRequest.handler,
				architecture: Lambda.Architecture.ARM_64,
				runtime: Lambda.Runtime.NODEJS_18_X,
				timeout: Duration.seconds(5),
				memorySize: 1792,
				code: new LambdaSource(this, lambdaSources.historicalDataRequest).code,
				description: 'Handle historical data request',
				environment: {
					VERSION: this.node.tryGetContext('version'),
					LOG_LEVEL: this.node.tryGetContext('logLevel'),
					HISTORICAL_DATA_TABLE_INFO: this.table.ref,
					NODE_NO_WARNINGS: '1',
				},
				layers,
				initialPolicy: [
					new IAM.PolicyStatement({
						actions: [
							'timestream:Select',
							'timestream:DescribeTable',
							'timestream:ListMeasures',
						],
						resources: [this.table.attrArn],
					}),
					new IAM.PolicyStatement({
						actions: [
							'timestream:DescribeEndpoints',
							'timestream:SelectValues',
							'timestream:CancelQuery',
						],
						resources: ['*'],
					}),
				],
				logRetention: Logs.RetentionDays.ONE_WEEK,
			},
		)
		new Events.Rule(this, 'historicalDataRequestRule', {
			eventPattern: {
				source: ['thingy.ws'],
				detailType: ['request'],
			},
			targets: [new EventTargets.LambdaFunction(historicalDataRequest)],
			eventBus: websocketAPI.eventBus,
		})
	}
}
