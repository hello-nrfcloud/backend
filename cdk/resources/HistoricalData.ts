import {
	LambdaLogGroup,
	LambdaSource,
} from '@bifravst/aws-cdk-lambda-helpers/cdk'
import { Context } from '@hello.nrfcloud.com/proto/hello'
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
import type { BackendLambdas } from '../packBackendLambdas.js'
import type { WebsocketEventBus } from './WebsocketEventBus.js'

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
			websocketEventBus,
		}: {
			websocketEventBus: WebsocketEventBus
			lambdaSources: Pick<
				BackendLambdas,
				'storeMessagesInTimestream' | 'historicalDataRequest'
			>
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
			this.node.getContext('isTest') === true
				? RemovalPolicy.DESTROY
				: RemovalPolicy.RETAIN,
		)

		const storeMessagesInTimestream = new Lambda.Function(
			this,
			'storeMessagesInTimestream',
			{
				handler: lambdaSources.storeMessagesInTimestream.handler,
				architecture: Lambda.Architecture.ARM_64,
				runtime: Lambda.Runtime.NODEJS_20_X,
				timeout: Duration.seconds(5),
				memorySize: 1792,
				code: new LambdaSource(this, lambdaSources.storeMessagesInTimestream)
					.code,
				description: 'Save converted messages into Timestream database',
				environment: {
					VERSION: this.node.getContext('version'),
					HISTORICAL_DATA_TABLE_INFO: this.table.ref,
					NODE_NO_WARNINGS: '1',
					DISABLE_METRICS: this.node.getContext('isTest') === true ? '1' : '0',
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
				...new LambdaLogGroup(this, 'storeMessagesInTimestreamLogs'),
			},
		)
		new Events.Rule(this, 'messagesRule', {
			eventPattern: {
				source: ['hello.ws'],
				detailType: ['message'],
			},
			targets: [new EventTargets.LambdaFunction(storeMessagesInTimestream)],
			eventBus: websocketEventBus.eventBus,
		})

		const historicalDataRequest = new Lambda.Function(
			this,
			'historicalDataRequest',
			{
				handler: lambdaSources.historicalDataRequest.handler,
				architecture: Lambda.Architecture.ARM_64,
				runtime: Lambda.Runtime.NODEJS_20_X,
				timeout: Duration.seconds(60),
				memorySize: 1792,
				code: new LambdaSource(this, lambdaSources.historicalDataRequest).code,
				description: 'Handle historical data request',
				environment: {
					VERSION: this.node.getContext('version'),
					HISTORICAL_DATA_TABLE_INFO: this.table.ref,
					EVENTBUS_NAME: websocketEventBus.eventBus.eventBusName,
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
				...new LambdaLogGroup(this, 'historicalDataRequestLogs'),
			},
		)
		new Events.Rule(this, 'historicalDataRequestRule', {
			eventPattern: {
				source: ['hello.ws'],
				detailType: [Context.historicalDataRequest.toString()],
			},
			targets: [new EventTargets.LambdaFunction(historicalDataRequest)],
			eventBus: websocketEventBus.eventBus,
		})
		websocketEventBus.eventBus.grantPutEventsTo(historicalDataRequest)
	}
}
