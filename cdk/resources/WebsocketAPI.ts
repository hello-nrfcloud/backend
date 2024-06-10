import { PackedLambdaFn } from '@bifravst/aws-cdk-lambda-helpers/cdk'
import {
	aws_apigatewayv2 as ApiGatewayV2,
	Duration,
	aws_events as Events,
	aws_events_targets as EventsTargets,
	aws_iam as IAM,
	Stack,
	type aws_lambda as Lambda,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import type { BackendLambdas } from '../packBackendLambdas.js'
import { ApiLogging } from './APILogging.js'
import type { DeviceLastSeen } from './DeviceLastSeen.js'
import type { DeviceStorage } from './DeviceStorage.js'
import type { WebsocketConnectionsTable } from './WebsocketConnectionsTable.js'
import type { WebsocketEventBus } from './WebsocketEventBus.js'

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
	public readonly onConnectFn: PackedLambdaFn
	public readonly onMessageFn: PackedLambdaFn
	public readonly onDisconnectFn: PackedLambdaFn
	public readonly authorizerFn: PackedLambdaFn
	public readonly publishToWebsocketClientsFn: PackedLambdaFn
	public constructor(
		parent: Construct,
		{
			deviceStorage,
			lambdaSources,
			layers,
			lastSeen,
			eventBus,
			connectionsTable,
		}: {
			deviceStorage: DeviceStorage
			lambdaSources: Pick<
				BackendLambdas,
				| 'authorizer'
				| 'onConnect'
				| 'onMessage'
				| 'onDisconnect'
				| 'publishToWebsocketClients'
			>
			layers: Lambda.ILayerVersion[]
			lastSeen: DeviceLastSeen
			eventBus: WebsocketEventBus
			connectionsTable: WebsocketConnectionsTable
		},
	) {
		super(parent, 'WebsocketAPI')

		// OnConnect
		this.onConnectFn = new PackedLambdaFn(
			this,
			'onConnect',
			lambdaSources.onConnect,
			{
				description: 'Registers new clients',
				environment: {
					WEBSOCKET_CONNECTIONS_TABLE_NAME: connectionsTable.table.tableName,
					EVENTBUS_NAME: eventBus.eventBus.eventBusName,
					LAST_SEEN_TABLE_NAME: lastSeen.table.tableName,
				},
				layers,
				initialPolicy: [
					new IAM.PolicyStatement({
						actions: ['iot:GetThingShadow'],
						resources: ['*'],
					}),
				],
			},
		)
		eventBus.eventBus.grantPutEventsTo(this.onConnectFn.fn)
		connectionsTable.table.grantWriteData(this.onConnectFn.fn)
		lastSeen.table.grantReadData(this.onConnectFn.fn)

		// onMessage
		this.onMessageFn = new PackedLambdaFn(
			this,
			'onMessage',
			lambdaSources.onMessage,
			{
				description: 'Handles messages sent by clients',
				environment: {
					WEBSOCKET_CONNECTIONS_TABLE_NAME: connectionsTable.table.tableName,
				},
				layers,
			},
		)
		connectionsTable.table.grantWriteData(this.onMessageFn.fn)

		// OnDisconnect
		this.onDisconnectFn = new PackedLambdaFn(
			this,
			'onDisconnect',
			lambdaSources.onDisconnect,
			{
				description: 'De-registers clients',
				environment: {
					WEBSOCKET_CONNECTIONS_TABLE_NAME: connectionsTable.table.tableName,
					EVENTBUS_NAME: eventBus.eventBus.eventBusName,
				},
				layers,
			},
		)
		connectionsTable.table.grantWriteData(this.onDisconnectFn.fn)
		eventBus.eventBus.grantPutEventsTo(this.onDisconnectFn.fn)

		// Request authorizer
		this.authorizerFn = new PackedLambdaFn(
			this,
			'authorizerLambda',
			lambdaSources.authorizer,
			{
				description:
					'Authorize WS connection request using device fingerprints ',
				layers,
				environment: {
					DEVICES_TABLE_NAME: deviceStorage.devicesTable.tableName,
					DEVICES_INDEX_NAME: deviceStorage.devicesTableFingerprintIndexName,
				},
			},
		)
		deviceStorage.devicesTable.grantReadWriteData(this.authorizerFn.fn)

		// API
		const api = new ApiGatewayV2.CfnApi(this, 'api', {
			name: 'hello.nrfcloud.com websocket API',
			protocolType: 'WEBSOCKET',
			routeSelectionExpression: '$request.body.message',
		})
		// Authorization
		const authorizer = new ApiGatewayV2.CfnAuthorizer(
			this,
			'fingerprintAuthorizer',
			{
				apiId: api.ref,
				authorizerType: 'REQUEST',
				name: `fingerprintAuthorizer`,
				authorizerUri: integrationUri(this, this.authorizerFn.fn),
			},
		)
		this.authorizerFn.fn.addPermission('invokeByHttpApi', {
			principal: new IAM.ServicePrincipal(
				'apigateway.amazonaws.com',
			) as IAM.IPrincipal,
			sourceArn: `arn:aws:execute-api:${Stack.of(this).region}:${
				Stack.of(this).account
			}:${api.ref}/authorizers/${authorizer.attrAuthorizerId}`,
		})
		// API on connect
		const connectIntegration = new ApiGatewayV2.CfnIntegration(
			this,
			'connectIntegration',
			{
				apiId: api.ref,
				description: 'Connect integration',
				integrationType: 'AWS_PROXY',
				integrationUri: integrationUri(this, this.onConnectFn.fn),
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
				integrationUri: integrationUri(this, this.onMessageFn.fn),
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
				integrationUri: integrationUri(this, this.onDisconnectFn.fn),
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
		// API invoke lambda permissions
		this.onConnectFn.fn.addPermission('invokeByAPI', {
			principal: new IAM.ServicePrincipal(
				'apigateway.amazonaws.com',
			) as IAM.IPrincipal,
			sourceArn: `arn:aws:execute-api:${Stack.of(this).region}:${
				Stack.of(this).account
			}:${api.ref}/${prodStage.stageName}/$connect`,
		})
		this.onMessageFn.fn.addPermission('invokeByAPI', {
			principal: new IAM.ServicePrincipal(
				'apigateway.amazonaws.com',
			) as IAM.IPrincipal,
			sourceArn: `arn:aws:execute-api:${Stack.of(this).region}:${
				Stack.of(this).account
			}:${api.ref}/${prodStage.stageName}/message`,
		})
		this.onDisconnectFn.fn.addPermission('invokeByAPI', {
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

		// Publish event to sockets
		this.publishToWebsocketClientsFn = new PackedLambdaFn(
			this,
			'publishToWebsocketClients',
			lambdaSources.publishToWebsocketClients,
			{
				timeout: Duration.minutes(1),
				description: 'Publish events to web socket clients',
				environment: {
					WEBSOCKET_CONNECTIONS_TABLE_NAME: connectionsTable.table.tableName,
					WEBSOCKET_MANAGEMENT_API_URL: this.websocketManagementAPIURL,
					EVENTBUS_NAME: eventBus.eventBus.eventBusName,
				},
				initialPolicy: [
					new IAM.PolicyStatement({
						actions: ['execute-api:ManageConnections'],
						resources: [this.websocketAPIArn],
					}),
					new IAM.PolicyStatement({
						resources: [connectionsTable.table.tableArn],
						actions: ['dynamodb:PartiQLSelect'],
					}),
				],
				layers,
			},
		)
		connectionsTable.table.grantReadWriteData(
			this.publishToWebsocketClientsFn.fn,
		)
		new Events.Rule(this, 'publishToWebsocketClientsRule', {
			eventPattern: {
				source: ['hello.ws'],
			},
			targets: [
				new EventsTargets.LambdaFunction(this.publishToWebsocketClientsFn.fn),
			],
			eventBus: eventBus.eventBus,
		})

		// Logging
		if (this.node.tryGetContext('wsAPILogging') !== undefined)
			new ApiLogging(this, api, prodStage)
	}
}
