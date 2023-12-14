import {
	aws_apigatewayv2 as ApiGatewayV2,
	Duration,
	aws_events as Events,
	aws_events_targets as EventsTargets,
	aws_iam as IAM,
	aws_lambda as Lambda,
	aws_logs as Logs,
	Stack,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import type { PackedLambda } from '../helpers/lambdas/packLambda'
import { ApiLogging } from './ApiLogging.js'
import type { DeviceLastSeen } from './DeviceLastSeen.js'
import type { DeviceStorage } from './DeviceStorage.js'
import { LambdaSource } from './LambdaSource.js'
import type { WebsocketConnectionsTable } from './WebsocketConnectionsTable'
import type { WebsocketEventBus } from './WebsocketEventBus'
import type { DeviceShadow } from './DeviceShadow'

export const integrationUri = (
	parent: Construct,
	f: Lambda.IFunction,
): string =>
	`arn:aws:apigateway:${
		Stack.of(parent).region
	}:lambda:path/2015-03-31/functions/arn:aws:lambda:${
		Stack.of(parent).region
	}:${Stack.of(parent).account}:function:${f.functionName}/invocations`

export class WebsocketAPI extends Construct {
	public readonly websocketURI: string
	public readonly websocketAPIArn: string
	public readonly websocketManagementAPIURL: string
	public constructor(
		parent: Construct,
		{
			deviceStorage,
			lambdaSources,
			layers,
			lastSeen,
			eventBus,
			connectionsTable,
			deviceShadow,
		}: {
			deviceStorage: DeviceStorage
			deviceShadow: DeviceShadow
			lambdaSources: {
				authorizer: PackedLambda
				onConnect: PackedLambda
				onMessage: PackedLambda
				onDisconnect: PackedLambda
				publishToWebsocketClients: PackedLambda
			}
			layers: Lambda.ILayerVersion[]
			lastSeen: DeviceLastSeen
			eventBus: WebsocketEventBus
			connectionsTable: WebsocketConnectionsTable
		},
	) {
		super(parent, 'WebsocketAPI')

		// OnConnect
		const onConnect = new Lambda.Function(this, 'onConnect', {
			handler: lambdaSources.onConnect.handler,
			architecture: Lambda.Architecture.ARM_64,
			runtime: Lambda.Runtime.NODEJS_18_X,
			timeout: Duration.seconds(5),
			memorySize: 1792,
			code: new LambdaSource(this, lambdaSources.onConnect).code,
			description: 'Registers new clients',
			environment: {
				VERSION: this.node.tryGetContext('version'),
				WEBSOCKET_CONNECTIONS_TABLE_NAME: connectionsTable.table.tableName,
				EVENTBUS_NAME: eventBus.eventBus.eventBusName,
				LOG_LEVEL: this.node.tryGetContext('logLevel'),
				NODE_NO_WARNINGS: '1',
				DISABLE_METRICS: this.node.tryGetContext('isTest') === true ? '1' : '0',
				LAST_SEEN_TABLE_NAME: lastSeen.table.tableName,
				DEVICE_SHADOW_TABLE_NAME: deviceShadow.deviceShadowTable.tableName,
			},
			layers,
			logRetention: Logs.RetentionDays.ONE_WEEK,
		})
		eventBus.eventBus.grantPutEventsTo(onConnect)
		connectionsTable.table.grantWriteData(onConnect)
		lastSeen.table.grantReadData(onConnect)
		deviceShadow.deviceShadowTable.grantReadData(onConnect)

		// onMessage
		const onMessage = new Lambda.Function(this, 'onMessage', {
			handler: lambdaSources.onMessage.handler,
			architecture: Lambda.Architecture.ARM_64,
			runtime: Lambda.Runtime.NODEJS_18_X,
			timeout: Duration.seconds(5),
			memorySize: 1792,
			code: new LambdaSource(this, lambdaSources.onMessage).code,
			description: 'Handles messages sent by clients',
			environment: {
				VERSION: this.node.tryGetContext('version'),
				WEBSOCKET_CONNECTIONS_TABLE_NAME: connectionsTable.table.tableName,
				EVENTBUS_NAME: eventBus.eventBus.eventBusName,
				LOG_LEVEL: this.node.tryGetContext('logLevel'),
				NODE_NO_WARNINGS: '1',
				DISABLE_METRICS: this.node.tryGetContext('isTest') === true ? '1' : '0',
			},
			layers,
			logRetention: Logs.RetentionDays.ONE_WEEK,
		})
		eventBus.eventBus.grantPutEventsTo(onMessage)
		connectionsTable.table.grantWriteData(onMessage)

		// OnDisconnect
		const onDisconnect = new Lambda.Function(this, 'onDisconnect', {
			handler: lambdaSources.onDisconnect.handler,
			architecture: Lambda.Architecture.ARM_64,
			runtime: Lambda.Runtime.NODEJS_18_X,
			timeout: Duration.seconds(5),
			memorySize: 1792,
			code: new LambdaSource(this, lambdaSources.onDisconnect).code,
			description: 'De-registers clients',
			environment: {
				VERSION: this.node.tryGetContext('version'),
				WEBSOCKET_CONNECTIONS_TABLE_NAME: connectionsTable.table.tableName,
				EVENTBUS_NAME: eventBus.eventBus.eventBusName,
				LOG_LEVEL: this.node.tryGetContext('logLevel'),
				NODE_NO_WARNINGS: '1',
				DISABLE_METRICS: this.node.tryGetContext('isTest') === true ? '1' : '0',
			},
			layers,
			logRetention: Logs.RetentionDays.ONE_WEEK,
		})
		connectionsTable.table.grantWriteData(onDisconnect)
		eventBus.eventBus.grantPutEventsTo(onDisconnect)

		// Request authorizer
		const authorizerLambda = new Lambda.Function(this, 'authorizerLambda', {
			description: 'Authorize WS connection request using device fingerprints ',
			handler: lambdaSources.authorizer.handler,
			architecture: Lambda.Architecture.ARM_64,
			runtime: Lambda.Runtime.NODEJS_18_X,
			timeout: Duration.seconds(1),
			memorySize: 1792,
			code: new LambdaSource(this, lambdaSources.authorizer).code,
			layers,
			logRetention: Logs.RetentionDays.ONE_WEEK,
			environment: {
				VERSION: this.node.tryGetContext('version'),
				DEVICES_TABLE_NAME: deviceStorage.devicesTable.tableName,
				DEVICES_INDEX_NAME: deviceStorage.devicesTableFingerprintIndexName,
				LOG_LEVEL: this.node.tryGetContext('logLevel'),
				NODE_NO_WARNINGS: '1',
				DISABLE_METRICS: this.node.tryGetContext('isTest') === true ? '1' : '0',
			},
		})
		deviceStorage.devicesTable.grantReadWriteData(authorizerLambda)

		// API
		const api = new ApiGatewayV2.CfnApi(this, 'api', {
			name: 'websocketGateway',
			protocolType: 'WEBSOCKET',
			routeSelectionExpression: '$request.body.message',
		})
		const authorizer = new ApiGatewayV2.CfnAuthorizer(this, 'authorizer', {
			apiId: api.ref,
			authorizerType: 'REQUEST',
			name: `authorizer`,
			authorizerUri: integrationUri(this, authorizerLambda),
		})
		authorizerLambda.addPermission('invokeByHttpApi', {
			principal: new IAM.ServicePrincipal('apigateway.amazonaws.com'),
		})
		// API on connect
		const connectIntegration = new ApiGatewayV2.CfnIntegration(
			this,
			'connectIntegration',
			{
				apiId: api.ref,
				description: 'Connect integration',
				integrationType: 'AWS_PROXY',
				integrationUri: integrationUri(this, onConnect),
			},
		)
		const connectRoute = new ApiGatewayV2.CfnRoute(this, 'connectRoute', {
			apiId: api.ref,
			routeKey: '$connect',
			authorizationType: 'CUSTOM',
			operationName: 'ConnectRoute',
			target: `integrations/${connectIntegration.ref}`,
			authorizerId: authorizer?.ref,
		})
		// API on message
		const onMessageIntegration = new ApiGatewayV2.CfnIntegration(
			this,
			'onMessageIntegration',
			{
				apiId: api.ref,
				description: 'On message integration',
				integrationType: 'AWS_PROXY',
				integrationUri: integrationUri(this, onMessage),
			},
		)
		const onMessageRoute = new ApiGatewayV2.CfnRoute(this, 'onMessageRoute', {
			apiId: api.ref,
			routeKey: 'message',
			authorizationType: 'NONE',
			operationName: 'OnMessageRoute',
			target: `integrations/${onMessageIntegration.ref}`,
		})
		// API on disconnect
		const disconnectIntegration = new ApiGatewayV2.CfnIntegration(
			this,
			'disconnectIntegration',
			{
				apiId: api.ref,
				description: 'Disconnect integration',
				integrationType: 'AWS_PROXY',
				integrationUri: integrationUri(this, onDisconnect),
			},
		)
		const disconnectRoute = new ApiGatewayV2.CfnRoute(this, 'disconnectRoute', {
			apiId: api.ref,
			routeKey: '$disconnect',
			authorizationType: 'NONE',
			operationName: 'DisconnectRoute',
			target: `integrations/${disconnectIntegration.ref}`,
		})
		// API deploy
		const deployment = new ApiGatewayV2.CfnDeployment(this, 'apiDeployment', {
			apiId: api.ref,
		})
		deployment.node.addDependency(connectRoute)
		deployment.node.addDependency(onMessageRoute)
		deployment.node.addDependency(disconnectRoute)
		const prodStage = new ApiGatewayV2.CfnStage(this, 'prodStage', {
			stageName: '2023-06-22',
			deploymentId: deployment.ref,
			apiId: api.ref,
		})
		this.websocketURI = `${api.attrApiEndpoint}/${prodStage.ref}`
		// API invoke lambda
		onConnect.addPermission('invokeByAPI', {
			principal: new IAM.ServicePrincipal(
				'apigateway.amazonaws.com',
			) as IAM.IPrincipal,
			sourceArn: `arn:aws:execute-api:${Stack.of(this).region}:${
				Stack.of(this).account
			}:${api.ref}/${prodStage.stageName}/$connect`,
		})
		onMessage.addPermission('invokeByAPI', {
			principal: new IAM.ServicePrincipal(
				'apigateway.amazonaws.com',
			) as IAM.IPrincipal,
			sourceArn: `arn:aws:execute-api:${Stack.of(this).region}:${
				Stack.of(this).account
			}:${api.ref}/${prodStage.stageName}/message`,
		})
		onDisconnect.addPermission('invokeByAPI', {
			principal: new IAM.ServicePrincipal(
				'apigateway.amazonaws.com',
			) as IAM.IPrincipal,
			sourceArn: `arn:aws:execute-api:${Stack.of(this).region}:${
				Stack.of(this).account
			}:${api.ref}/${prodStage.stageName}/$disconnect`,
		})

		// Construct URLs
		this.websocketURI = `wss://${api.ref}.execute-api.${
			Stack.of(this).region
		}.amazonaws.com/${prodStage.ref}`
		this.websocketAPIArn = `arn:aws:execute-api:${Stack.of(this).region}:${
			Stack.of(this).account
		}:${api.ref}/${prodStage.stageName}/POST/@connections/*`
		this.websocketManagementAPIURL = `https://${api.ref}.execute-api.${
			Stack.of(this).region
		}.amazonaws.com/${prodStage.stageName}`

		// Logging
		if (this.node.tryGetContext('isTest') === true) {
			new ApiLogging(this, api, prodStage)
		}

		// Publish event to sockets
		const publishToWebsocketClients = new Lambda.Function(
			this,
			'publishToWebsocketClients',
			{
				handler: lambdaSources.publishToWebsocketClients.handler,
				architecture: Lambda.Architecture.ARM_64,
				runtime: Lambda.Runtime.NODEJS_18_X,
				timeout: Duration.minutes(1),
				memorySize: 1792,
				code: new LambdaSource(this, lambdaSources.publishToWebsocketClients)
					.code,
				description: 'Publish event to web socket clients',
				environment: {
					VERSION: this.node.tryGetContext('version'),
					WEBSOCKET_CONNECTIONS_TABLE_NAME: connectionsTable.table.tableName,
					WEBSOCKET_MANAGEMENT_API_URL: this.websocketManagementAPIURL,
					EVENTBUS_NAME: eventBus.eventBus.eventBusName,
					LOG_LEVEL: this.node.tryGetContext('logLevel'),
					NODE_NO_WARNINGS: '1',
					DISABLE_METRICS:
						this.node.tryGetContext('isTest') === true ? '1' : '0',
				},
				initialPolicy: [
					new IAM.PolicyStatement({
						actions: ['execute-api:ManageConnections'],
						resources: [this.websocketAPIArn],
					}),
					new IAM.PolicyStatement({
						effect: IAM.Effect.ALLOW,
						resources: [connectionsTable.table.tableArn],
						actions: ['dynamodb:PartiQLSelect'],
					}),
				],
				layers,
				logRetention: Logs.RetentionDays.ONE_WEEK,
			},
		)
		connectionsTable.table.grantReadWriteData(publishToWebsocketClients)
		new Events.Rule(this, 'publishToWebsocketClientsRule', {
			eventPattern: {
				source: ['thingy.ws'],
				detailType: ['message', 'connect', 'error'],
			},
			targets: [new EventsTargets.LambdaFunction(publishToWebsocketClients)],
			eventBus: eventBus.eventBus,
		})
	}
}
