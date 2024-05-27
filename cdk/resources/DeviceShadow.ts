import {
	IoTActionRole,
	PackedLambdaFn,
} from '@bifravst/aws-cdk-lambda-helpers/cdk'
import type { aws_lambda as Lambda } from 'aws-cdk-lib'
import {
	Duration,
	aws_dynamodb as DynamoDB,
	aws_lambda_event_sources as EventSources,
	aws_events_targets as EventTargets,
	aws_events as Events,
	aws_iam as IAM,
	aws_iot as IoT,
	RemovalPolicy,
	aws_sqs as SQS,
	Stack,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import type { BackendLambdas } from '../packBackendLambdas.js'
import type { WebsocketConnectionsTable } from './WebsocketConnectionsTable.js'
import type { WebsocketEventBus } from './WebsocketEventBus.js'
import type { DeviceStorage } from './DeviceStorage.js'

/**
 * Updates the LwM2M shadow for each device from nRF Cloud
 */
export class DeviceShadow extends Construct {
	public constructor(
		parent: Construct,
		{
			lambdaSources,
			layers,
			eventBus,
			connectionsTable,
			deviceStorage,
		}: {
			lambdaSources: Pick<
				BackendLambdas,
				| 'prepareDeviceShadow'
				| 'fetchDeviceShadow'
				| 'publishShadowUpdatesToWebsocket'
			>
			layers: Lambda.ILayerVersion[]
			eventBus: WebsocketEventBus
			connectionsTable: WebsocketConnectionsTable
			deviceStorage: DeviceStorage
		},
	) {
		super(parent, 'DeviceShadow')

		// The duration to allow lambda to process device shadow
		const processDeviceShadowTimeout = Duration.minutes(1)

		// Scheduler
		// The lower bound of event schedule is 60 seconds.
		// Therefore, to achieve the lower interval, we will use delayed queue along with event schedule
		const scheduleDuration = Duration.seconds(60)
		const scheduler = new Events.Rule(this, 'scheduler', {
			description: `Scheduler to fetch devices's shadow`,
			schedule: Events.Schedule.rate(scheduleDuration),
		})

		// Working queue to fetch device shadow
		const shadowQueue = new SQS.Queue(this, 'shadowQueue', {
			retentionPeriod: scheduleDuration,
			removalPolicy: RemovalPolicy.DESTROY,
			visibilityTimeout: processDeviceShadowTimeout,
		})

		// Distribution lock database
		// The reason why we need lock is the fact that the lower bound of SQS lambda invocation is 2
		const lockTable = new DynamoDB.Table(this, 'lockTable', {
			billingMode: DynamoDB.BillingMode.PAY_PER_REQUEST,
			partitionKey: {
				name: 'lockName',
				type: DynamoDB.AttributeType.STRING,
			},
			removalPolicy: RemovalPolicy.DESTROY,
			timeToLiveAttribute: 'ttl',
		})

		// Lambda functions
		const prepareDeviceShadow = new PackedLambdaFn(
			this,
			'prepareDeviceShadow',
			lambdaSources.prepareDeviceShadow,
			{
				description: 'Generate queue to fetch the shadow data',
				environment: {
					QUEUE_URL: shadowQueue.queueUrl,
				},
				layers,
			},
		).fn
		scheduler.addTarget(new EventTargets.LambdaFunction(prepareDeviceShadow))
		shadowQueue.grantSendMessages(prepareDeviceShadow)

		const fetchDeviceShadow = new PackedLambdaFn(
			this,
			'fetchDeviceShadow',
			lambdaSources.fetchDeviceShadow,
			{
				timeout: processDeviceShadowTimeout,
				description: `Fetch devices' shadow from nRF Cloud`,
				environment: {
					LOCK_TABLE_NAME: lockTable.tableName,
					WEBSOCKET_CONNECTIONS_TABLE_NAME: connectionsTable.table.tableName,
				},
				layers,
				initialPolicy: [
					new IAM.PolicyStatement({
						actions: ['iot:UpdateThingShadow'],
						resources: ['*'],
					}),
				],
			},
		).fn
		connectionsTable.table.grantReadWriteData(fetchDeviceShadow)
		const ssmReadPolicy = new IAM.PolicyStatement({
			effect: IAM.Effect.ALLOW,
			actions: ['ssm:GetParametersByPath'],
			resources: [
				`arn:aws:ssm:${Stack.of(this).region}:${
					Stack.of(this).account
				}:parameter/${Stack.of(this).stackName}/stack/context`,
			],
		})
		fetchDeviceShadow.addToRolePolicy(ssmReadPolicy)
		lockTable.grantReadWriteData(fetchDeviceShadow)
		fetchDeviceShadow.addEventSource(
			new EventSources.SqsEventSource(shadowQueue, {
				batchSize: 10,
				maxConcurrency: 15,
			}),
		)

		// Publish shadow updates to the websocket clients
		const publishShadowUpdatesToWebsocket = new PackedLambdaFn(
			this,
			'publishShadowUpdatesToWebsocket',
			lambdaSources.publishShadowUpdatesToWebsocket,
			{
				timeout: Duration.minutes(1),
				description: 'Publish shadow updates to the websocket clients',
				environment: {
					WEBSOCKET_CONNECTIONS_TABLE_NAME: connectionsTable.table.tableName,
					EVENTBUS_NAME: eventBus.eventBus.eventBusName,
				},
				layers,
			},
		).fn
		connectionsTable.table.grantReadWriteData(publishShadowUpdatesToWebsocket)

		// AWS IoT Rule
		const updateShadowRuleRole = new IoTActionRole(this).role
		updateShadowRuleRole.addToPrincipalPolicy(
			new IAM.PolicyStatement({
				actions: ['dynamodb:PartiQLSelect'],
				resources: [deviceStorage.devicesTable.tableArn],
			}),
		)
		const updateShadowRule = new IoT.CfnTopicRule(this, 'updateShadowRule', {
			topicRulePayload: {
				description:
					'Publish shadow updates to the LwM2M shadow to the websocket clients',
				ruleDisabled: false,
				awsIotSqlVersion: '2016-03-23',
				sql: [
					`SELECT`,
					`state,`,
					`get_dynamodb("${deviceStorage.devicesTable.tableName}", "deviceId", topic(3), "${updateShadowRuleRole.roleArn}").model AS model,`,
					`topic(3) as deviceId`,
					`FROM '$aws/things/+/shadow/name/lwm2m/update/accepted'`,
				].join(' '),
				actions: [
					{
						lambda: {
							functionArn: publishShadowUpdatesToWebsocket.functionArn,
						},
					},
				],
				errorAction: {
					republish: {
						roleArn: updateShadowRuleRole.roleArn,
						topic: 'errors',
					},
				},
			},
		})

		publishShadowUpdatesToWebsocket.addPermission('updateShadowRule', {
			principal: new IAM.ServicePrincipal('iot.amazonaws.com'),
			sourceArn: updateShadowRule.attrArn,
		})
	}
}
