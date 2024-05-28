import { PackedLambdaFn } from '@bifravst/aws-cdk-lambda-helpers/cdk'
import {
	aws_apigatewayv2 as ApiGatewayV2,
	Duration,
	aws_events as Events,
	aws_events_targets as EventsTargets,
	aws_iam as IAM,
	type aws_lambda as Lambda,
	Stack,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import type { BackendLambdas } from '../packBackendLambdas.js'
import type { DeviceLastSeen } from './DeviceLastSeen.js'
import type { DeviceStorage } from './DeviceStorage.js'
import type { WebsocketConnectionsTable } from './WebsocketConnectionsTable.js'
import type { WebsocketEventBus } from './WebsocketEventBus.js'
import { ApiLogging } from './APILogging.js'

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
		const onConnect = new PackedLambdaFn(
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
		).fn
		eventBus.eventBus.grantPutEventsTo(onConnect)
		connectionsTable.table.grantWriteData(onConnect)
		lastSeen.table.grantReadData(onConnect)

		// onMessage
		const onMessage = new PackedLambdaFn(
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
		).fn
		connectionsTable.table.grantWriteData(onMessage)

		// OnDisconnect
		const onDisconnect = new PackedLambdaFn(
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
		).fn
		connectionsTable.table.grantWriteData(onDisconnect)
		eventBus.eventBus.grantPutEventsTo(onDisconnect)

		// Request authorizer
		const authorizerLambda = new PackedLambdaFn(
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
		).fn
		deviceStorage.devicesTable.grantReadWriteData(authorizerLambda)

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
				authorizerUri: integrationUri(this, authorizerLambda),
			},
		)
		authorizerLambda.addPermission('invokeByHttpApi', {
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
		// API invoke lambda permissions
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

		// Publish event to sockets
		const publishToWebsocketClients = new PackedLambdaFn(
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
		).fn
		connectionsTable.table.grantReadWriteData(publishToWebsocketClients)
		new Events.Rule(this, 'publishToWebsocketClientsRule', {
			eventPattern: {
				source: ['hello.ws'],
			},
			targets: [new EventsTargets.LambdaFunction(publishToWebsocketClients)],
			eventBus: eventBus.eventBus,
		})

		// Logging
		if (this.node.tryGetContext('wsAPILogging') !== undefined)
			new ApiLogging(this, api, prodStage)
	}
}
