import {
	aws_apigatewayv2 as ApiGateway,
	aws_dynamodb as DynamoDB,
	aws_events as Events,
	aws_events_targets as EventsTargets,
	aws_iam as IAM,
	aws_lambda as Lambda,
	aws_pipes as Pipes,
	aws_sqs as Sqs,
	Duration,
	RemovalPolicy,
	Stack,
} from 'aws-cdk-lib'
import type { IPrincipal } from 'aws-cdk-lib/aws-iam/index.js'
import { Construct } from 'constructs'
import type { PackedLambda } from '../backend.js'
import { LambdaLogGroup } from '../resources/LambdaLogGroup.js'

export class WebsocketAPI extends Construct {
	public readonly websocketURI: string
	public readonly connectionsTable: DynamoDB.ITable
	public readonly eventBus: Events.IEventBus
	public readonly websocketAPIArn: string
	public readonly websocketManagementAPIURL: string
	public constructor(
		parent: Stack,
		{
			lambdaSources,
			layers,
		}: {
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

		// Event bridge
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
		}) as DynamoDB.ITable

		// OnConnect
		const onConnect = new Lambda.Function(this, 'onConnect', {
			handler: lambdaSources.onConnect.handler,
			architecture: Lambda.Architecture.ARM_64,
			runtime: Lambda.Runtime.NODEJS_18_X,
			timeout: Duration.seconds(5),
			memorySize: 1792,
			code: Lambda.Code.fromAsset(lambdaSources.onConnect.lambdaZipFile),
			description: 'Registers new clients',
			environment: {
				VERSION: this.node.tryGetContext('version'),
				CONNECTIONS_TABLE_NAME: this.connectionsTable.tableName,
				EVENTBUS_NAME: this.eventBus.eventBusName,
				LOG_LEVEL: this.node.tryGetContext('log_level'),
			},
			initialPolicy: [],
			layers: layers,
		})
		this.connectionsTable.grantWriteData(onConnect)
		this.eventBus.grantPutEventsTo(onConnect)
		new LambdaLogGroup(this, 'onConnectLogs', onConnect)

		// onMessage
		const onMessage = new Lambda.Function(this, 'onMessage', {
			handler: lambdaSources.onMessage.handler,
			architecture: Lambda.Architecture.ARM_64,
			runtime: Lambda.Runtime.NODEJS_18_X,
			timeout: Duration.seconds(5),
			memorySize: 1792,
			code: Lambda.Code.fromAsset(lambdaSources.onMessage.lambdaZipFile),
			description: 'Receives messages from clients',
			environment: {
				VERSION: this.node.tryGetContext('version'),
				CONNECTIONS_TABLE_NAME: this.connectionsTable.tableName,
				EVENTBUS_NAME: this.eventBus.eventBusName,
				LOG_LEVEL: this.node.tryGetContext('log_level'),
			},
			initialPolicy: [],
			layers: layers,
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
			code: Lambda.Code.fromAsset(lambdaSources.onDisconnect.lambdaZipFile),
			description: 'De-registers clients',
			environment: {
				VERSION: this.node.tryGetContext('version'),
				CONNECTIONS_TABLE_NAME: this.connectionsTable.tableName,
				EVENTBUS_NAME: this.eventBus.eventBusName,
				LOG_LEVEL: this.node.tryGetContext('log_level'),
			},
			initialPolicy: [],
			layers: layers,
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
				integrationUri: `arn:aws:apigateway:${parent.region}:lambda:path/2015-03-31/functions/${onConnect.functionArn}/invocations`,
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
				integrationUri: `arn:aws:apigateway:${parent.region}:lambda:path/2015-03-31/functions/${onMessage.functionArn}/invocations`,
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
				integrationUri: `arn:aws:apigateway:${parent.region}:lambda:path/2015-03-31/functions/${onDisconnect.functionArn}/invocations`,
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
		this.websocketURI = `wss://${api.ref}.execute-api.${parent.region}.amazonaws.com/${stage.ref}`
		// API invoke lambda
		onMessage.addPermission('invokeByAPI', {
			principal: new IAM.ServicePrincipal(
				'apigateway.amazonaws.com',
			) as IAM.IPrincipal,
			sourceArn: `arn:aws:execute-api:${parent.region}:${parent.account}:${api.ref}/${stage.stageName}/message`,
		})
		onConnect.addPermission('invokeByAPI', {
			principal: new IAM.ServicePrincipal(
				'apigateway.amazonaws.com',
			) as IAM.IPrincipal,
			sourceArn: `arn:aws:execute-api:${parent.region}:${parent.account}:${api.ref}/${stage.stageName}/$connect`,
		})
		onDisconnect.addPermission('invokeByAPI', {
			principal: new IAM.ServicePrincipal(
				'apigateway.amazonaws.com',
			) as IAM.IPrincipal,
			sourceArn: `arn:aws:execute-api:${parent.region}:${parent.account}:${api.ref}/${stage.stageName}/$disconnect`,
		})

		// Publish event to sockets
		this.websocketAPIArn = `arn:aws:execute-api:${parent.region}:${parent.account}:${api.ref}/${stage.stageName}/POST/@connections/*`
		this.websocketManagementAPIURL = `https://${api.ref}.execute-api.${parent.region}.amazonaws.com/${stage.stageName}`
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
					lambdaSources.publishToWebsocketClients.lambdaZipFile,
				),
				description: 'Publish event to web socket clients',
				environment: {
					VERSION: this.node.tryGetContext('version'),
					CONNECTIONS_TABLE_NAME: this.connectionsTable.tableName,
					WEBSOCKET_MANAGEMENT_API_URL: this.websocketManagementAPIURL,
					LOG_LEVEL: this.node.tryGetContext('log_level'),
				},
				initialPolicy: [
					new IAM.PolicyStatement({
						actions: ['execute-api:ManageConnections'],
						resources: [this.websocketAPIArn],
					}),
				],
				layers: layers,
			},
		)
		this.connectionsTable.grantReadData(publishToWebsocketClients)
		new LambdaLogGroup(
			this,
			'publishToWebsocketClientsLogs',
			publishToWebsocketClients,
		)
		const publishToWebsocketClientsRule = new Events.Rule(
			this,
			'publishToWebsocketClientsRule',
			{
				eventPattern: { source: ['ws.broadcast'] },
				targets: [new EventsTargets.LambdaFunction(publishToWebsocketClients)],
				eventBus: this.eventBus,
			},
		)
		publishToWebsocketClients.addPermission(
			'publishToWebSocketClientsInvokePermission',
			{
				principal: new IAM.ServicePrincipal(
					'events.amazonaws.com',
				) as IPrincipal,
				sourceArn: publishToWebsocketClientsRule.ruleArn,
			},
		)

		//  Pipe from SQS to event bridge
		const websocketDLQ = new Sqs.Queue(this, 'websocketDLQ', {})
		const websocketQueue = new Sqs.Queue(this, 'websocketQueue', {
			deadLetterQueue: {
				maxReceiveCount: 15,
				queue: websocketDLQ,
			},
		})
		const pipeRole = new IAM.Role(this, 'pipeSqsToEventRole', {
			assumedBy: new IAM.ServicePrincipal('pipes.amazonaws.com') as IPrincipal,
		})
		pipeRole.addToPolicy(
			new IAM.PolicyStatement({
				resources: [websocketQueue.queueArn],
				actions: [
					'sqs:ReceiveMessage',
					'sqs:DeleteMessage',
					'sqs:GetQueueAttributes',
				],
				effect: IAM.Effect.ALLOW,
			}),
		)
		pipeRole.addToPolicy(
			new IAM.PolicyStatement({
				resources: [this.eventBus.eventBusArn],
				actions: ['events:PutEvents'],
				effect: IAM.Effect.ALLOW,
			}),
		)
		new Pipes.CfnPipe(this, 'websocketPipe', {
			roleArn: pipeRole.roleArn,
			source: websocketQueue.queueArn,
			target: this.eventBus.eventBusArn,
			targetParameters: {
				eventBridgeEventBusParameters: {
					detailType: 'Event from queue',
					source: 'ws.broadcast',
				},
				inputTemplate: `{
					"context": {
						"connectionId": "sqs"
					},
					"payload": <$.body>
				}`,
			},
		})
	}
}
