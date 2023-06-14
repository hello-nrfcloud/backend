import {
	aws_apigatewayv2 as ApiGateway,
	Duration,
	aws_dynamodb as DynamoDB,
	aws_events as Events,
	aws_events_targets as EventsTargets,
	aws_iam as IAM,
	aws_lambda as Lambda,
	RemovalPolicy,
	Stack,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import type { PackedLambda } from '../helpers/lambdas/packLambda'
import { LambdaLogGroup } from '../resources/LambdaLogGroup.js'
import type { DeviceStorage } from './DeviceStorage.js'

export class WebsocketAPI extends Construct {
	public readonly websocketURI: string
	public readonly connectionsTable: DynamoDB.Table
	public readonly connectionsTableIndexName = 'deviceIdIndex'
	public readonly eventBus: Events.IEventBus
	public readonly websocketAPIArn: string
	public readonly websocketManagementAPIURL: string
	public constructor(
		parent: Construct,
		{
			deviceStorage,
			lambdaSources,
			layers,
		}: {
			deviceStorage: DeviceStorage
			lambdaSources: {
				onConnect: PackedLambda
				onMessage: PackedLambda
				onDisconnect: PackedLambda
				publishToWebsocketClients: PackedLambda
			}
			layers: Lambda.ILayerVersion[]
		},
	) {
		super(parent, 'WebsocketAPI')

		// Event bridge for publishing message though websocket
		this.eventBus = new Events.EventBus(this, 'eventBus', {})

		// Databases
		this.connectionsTable = new DynamoDB.Table(this, 'connectionsTable', {
			billingMode: DynamoDB.BillingMode.PAY_PER_REQUEST,
			partitionKey: {
				name: 'connectionId',
				type: DynamoDB.AttributeType.STRING,
			},
			timeToLiveAttribute: 'ttl',
			removalPolicy: RemovalPolicy.DESTROY,
		})
		this.connectionsTable.addGlobalSecondaryIndex({
			indexName: this.connectionsTableIndexName,
			partitionKey: {
				name: 'deviceId',
				type: DynamoDB.AttributeType.STRING,
			},
			projectionType: DynamoDB.ProjectionType.KEYS_ONLY,
		})

		// OnConnect
		const onConnect = new Lambda.Function(this, 'onConnect', {
			handler: lambdaSources.onConnect.handler,
			architecture: Lambda.Architecture.ARM_64,
			runtime: Lambda.Runtime.NODEJS_18_X,
			timeout: Duration.seconds(5),
			memorySize: 1792,
			code: Lambda.Code.fromAsset(lambdaSources.onConnect.zipFile),
			description: 'Registers new clients',
			environment: {
				VERSION: this.node.tryGetContext('version'),
				CONNECTIONS_TABLE_NAME: this.connectionsTable.tableName,
				DEVICES_TABLE_NAME: deviceStorage.devicesTable.tableName,
				DEVICES_INDEX_NAME: deviceStorage.devicesTableFingerprintIndexName,
				EVENTBUS_NAME: this.eventBus.eventBusName,
				LOG_LEVEL: this.node.tryGetContext('logLevel'),
				NODE_NO_WARNINGS: '1',
			},
			initialPolicy: [
				new IAM.PolicyStatement({
					actions: ['dynamodb:Query'],
					resources: [`${deviceStorage.devicesTable.tableArn}/index/*`],
				}),
			],
			layers,
		})
		this.connectionsTable.grantWriteData(onConnect)
		deviceStorage.devicesTable.grantReadData(onConnect)
		this.eventBus.grantPutEventsTo(onConnect)
		new LambdaLogGroup(this, 'onConnectLogs', onConnect)

		// onMessage
		const onMessage = new Lambda.Function(this, 'onMessage', {
			handler: lambdaSources.onMessage.handler,
			architecture: Lambda.Architecture.ARM_64,
			runtime: Lambda.Runtime.NODEJS_18_X,
			timeout: Duration.seconds(5),
			memorySize: 1792,
			code: Lambda.Code.fromAsset(lambdaSources.onMessage.zipFile),
			description: 'Receives messages from clients',
			environment: {
				VERSION: this.node.tryGetContext('version'),
				CONNECTIONS_TABLE_NAME: this.connectionsTable.tableName,
				EVENTBUS_NAME: this.eventBus.eventBusName,
				LOG_LEVEL: this.node.tryGetContext('logLevel'),
				NODE_NO_WARNINGS: '1',
			},
			initialPolicy: [],
			layers,
		})
		this.connectionsTable.grantReadWriteData(onMessage)
		this.eventBus.grantPutEventsTo(onMessage)
		new LambdaLogGroup(this, 'onMessageLogs', onMessage)

		// OnDisconnect
		const onDisconnect = new Lambda.Function(this, 'onDisconnect', {
			handler: lambdaSources.onDisconnect.handler,
			architecture: Lambda.Architecture.ARM_64,
			runtime: Lambda.Runtime.NODEJS_18_X,
			timeout: Duration.seconds(5),
			memorySize: 1792,
			code: Lambda.Code.fromAsset(lambdaSources.onDisconnect.zipFile),
			description: 'De-registers clients',
			environment: {
				VERSION: this.node.tryGetContext('version'),
				CONNECTIONS_TABLE_NAME: this.connectionsTable.tableName,
				EVENTBUS_NAME: this.eventBus.eventBusName,
				LOG_LEVEL: this.node.tryGetContext('logLevel'),
				NODE_NO_WARNINGS: '1',
			},
			initialPolicy: [],
			layers,
		})
		this.connectionsTable.grantWriteData(onDisconnect)
		this.eventBus.grantPutEventsTo(onDisconnect)
		new LambdaLogGroup(this, 'onDisconnectLogs', onDisconnect)

		// API
		const api = new ApiGateway.CfnApi(this, 'api', {
			name: 'websocketGateway',
			protocolType: 'WEBSOCKET',
			routeSelectionExpression: '$request.body.message',
		})
		// API on connect
		const connectIntegration = new ApiGateway.CfnIntegration(
			this,
			'connectIntegration',
			{
				apiId: api.ref,
				description: 'Connect integration',
				integrationType: 'AWS_PROXY',
				integrationUri: `arn:aws:apigateway:${
					Stack.of(this).region
				}:lambda:path/2015-03-31/functions/${
					onConnect.functionArn
				}/invocations`,
			},
		)
		const connectRoute = new ApiGateway.CfnRoute(this, 'connectRoute', {
			apiId: api.ref,
			routeKey: '$connect',
			authorizationType: 'NONE',
			operationName: 'ConnectRoute',
			target: `integrations/${connectIntegration.ref}`,
		})
		// API on message
		const sendMessageIntegration = new ApiGateway.CfnIntegration(
			this,
			'sendMessageIntegration',
			{
				apiId: api.ref,
				description: 'Send messages integration',
				integrationType: 'AWS_PROXY',
				integrationUri: `arn:aws:apigateway:${
					Stack.of(this).region
				}:lambda:path/2015-03-31/functions/${
					onMessage.functionArn
				}/invocations`,
			},
		)
		const sendMessageRoute = new ApiGateway.CfnRoute(this, 'sendMessageRoute', {
			apiId: api.ref,
			routeKey: 'message',
			authorizationType: 'NONE',
			operationName: 'sendMessageRoute',
			target: `integrations/${sendMessageIntegration.ref}`,
		})
		// API on disconnect
		const disconnectIntegration = new ApiGateway.CfnIntegration(
			this,
			'disconnectIntegration',
			{
				apiId: api.ref,
				description: 'Disconnect integration',
				integrationType: 'AWS_PROXY',
				integrationUri: `arn:aws:apigateway:${
					Stack.of(this).region
				}:lambda:path/2015-03-31/functions/${
					onDisconnect.functionArn
				}/invocations`,
			},
		)
		const disconnectRoute = new ApiGateway.CfnRoute(this, 'disconnectRoute', {
			apiId: api.ref,
			routeKey: '$disconnect',
			authorizationType: 'NONE',
			operationName: 'DisconnectRoute',
			target: `integrations/${disconnectIntegration.ref}`,
		})
		// API deploy
		const deployment = new ApiGateway.CfnDeployment(this, 'apiDeployment', {
			apiId: api.ref,
		})
		deployment.node.addDependency(connectRoute)
		deployment.node.addDependency(sendMessageRoute)
		deployment.node.addDependency(disconnectRoute)
		const stage = new ApiGateway.CfnStage(this, 'developmentStage', {
			stageName: 'dev',
			description: 'development stage',
			deploymentId: deployment.ref,
			apiId: api.ref,
		})
		this.websocketURI = `wss://${api.ref}.execute-api.${
			Stack.of(this).region
		}.amazonaws.com/${stage.ref}`
		// API invoke lambda
		onMessage.addPermission('invokeByAPI', {
			principal: new IAM.ServicePrincipal(
				'apigateway.amazonaws.com',
			) as IAM.IPrincipal,
			sourceArn: `arn:aws:execute-api:${Stack.of(this).region}:${
				Stack.of(this).account
			}:${api.ref}/${stage.stageName}/message`,
		})
		onConnect.addPermission('invokeByAPI', {
			principal: new IAM.ServicePrincipal(
				'apigateway.amazonaws.com',
			) as IAM.IPrincipal,
			sourceArn: `arn:aws:execute-api:${Stack.of(this).region}:${
				Stack.of(this).account
			}:${api.ref}/${stage.stageName}/$connect`,
		})
		onDisconnect.addPermission('invokeByAPI', {
			principal: new IAM.ServicePrincipal(
				'apigateway.amazonaws.com',
			) as IAM.IPrincipal,
			sourceArn: `arn:aws:execute-api:${Stack.of(this).region}:${
				Stack.of(this).account
			}:${api.ref}/${stage.stageName}/$disconnect`,
		})

		// Publish event to sockets
		this.websocketAPIArn = `arn:aws:execute-api:${Stack.of(this).region}:${
			Stack.of(this).account
		}:${api.ref}/${stage.stageName}/POST/@connections/*`
		this.websocketManagementAPIURL = `https://${api.ref}.execute-api.${
			Stack.of(this).region
		}.amazonaws.com/${stage.stageName}`
		const publishToWebsocketClients = new Lambda.Function(
			this,
			'publishToWebsocketClients',
			{
				handler: lambdaSources.publishToWebsocketClients.handler,
				architecture: Lambda.Architecture.ARM_64,
				runtime: Lambda.Runtime.NODEJS_18_X,
				timeout: Duration.minutes(1),
				memorySize: 1792,
				code: Lambda.Code.fromAsset(
					lambdaSources.publishToWebsocketClients.zipFile,
				),
				description: 'Publish event to web socket clients',
				environment: {
					VERSION: this.node.tryGetContext('version'),
					CONNECTIONS_TABLE_NAME: this.connectionsTable.tableName,
					CONNECTIONS_INDEX_NAME: this.connectionsTableIndexName,
					WEBSOCKET_MANAGEMENT_API_URL: this.websocketManagementAPIURL,
					EVENTBUS_NAME: this.eventBus.eventBusName,
					LOG_LEVEL: this.node.tryGetContext('logLevel'),
					NODE_NO_WARNINGS: '1',
				},
				initialPolicy: [
					new IAM.PolicyStatement({
						actions: ['execute-api:ManageConnections'],
						resources: [this.websocketAPIArn],
					}),
					new IAM.PolicyStatement({
						effect: IAM.Effect.ALLOW,
						resources: [
							`${this.connectionsTable.tableArn}`,
							`${this.connectionsTable.tableArn}/*`,
						],
						actions: ['dynamodb:PartiQLSelect'],
					}),
					new IAM.PolicyStatement({
						effect: IAM.Effect.DENY,
						actions: ['dynamodb:PartiQLSelect'],
						resources: [`${this.connectionsTable.tableArn}/*`],
						conditions: {
							Bool: {
								'dynamodb:FullTableScan': ['true'],
							},
						},
					}),
				],
				layers,
			},
		)
		this.connectionsTable.grantReadWriteData(publishToWebsocketClients)
		new LambdaLogGroup(
			this,
			'publishToWebsocketClientsLogs',
			publishToWebsocketClients,
		)
		new Events.Rule(this, 'publishToWebsocketClientsRule', {
			eventPattern: {
				source: ['thingy.ws'],
				detailType: ['message', 'connect'],
			},
			targets: [new EventsTargets.LambdaFunction(publishToWebsocketClients)],
			eventBus: this.eventBus,
		})
	}
}
