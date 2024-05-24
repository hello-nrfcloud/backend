import type { aws_apigatewayv2 as ApiGatewayV2 } from 'aws-cdk-lib'
import {
	aws_apigateway as ApiGateway,
	aws_iam as IAM,
	aws_logs as Logs,
	RemovalPolicy,
	Stack,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'

export class ApiLogging extends Construct {
	constructor(
		parent: Construct,
		api: ApiGatewayV2.CfnApi,
		stage: ApiGatewayV2.CfnStage,
	) {
		super(parent, 'apiLogging')

		const role = new IAM.Role(this, 'CloudWatchRole', {
			assumedBy: new IAM.ServicePrincipal('apigateway.amazonaws.com'),
			managedPolicies: [
				IAM.ManagedPolicy.fromAwsManagedPolicyName(
					'service-role/AmazonAPIGatewayPushToCloudWatchLogs',
				),
			],
		})
		const cloudWatchAccount = new ApiGateway.CfnAccount(this, 'Account', {
			cloudWatchRoleArn: role.roleArn,
		})
		cloudWatchAccount.node.addDependency(api)
		const apiLogs = new Logs.LogGroup(this, `apiLogs`, {
			removalPolicy: RemovalPolicy.DESTROY,
			logGroupName: `/${Stack.of(this).stackName}/websocket`,
			retention: Logs.RetentionDays.ONE_DAY,
		})
		stage.accessLogSettings = {
			destinationArn: apiLogs.logGroupArn,
			format: JSON.stringify({
				requestId: '$context.requestId',
				awsEndpointRequestId: '$context.awsEndpointRequestId',
				requestTime: '$context.requestTime',
				ip: '$context.identity.sourceIp',
				protocol: '$context.protocol',
				routeKey: '$context.routeKey',
				status: '$context.status',
				responseLength: '$context.responseLength',
				responseLatency: '$context.responseLatency',
				integrationLatency: '$context.integrationLatency',
				integrationStatus: '$context.integrationStatus',
				integrationErrorMessage: '$context.integrationErrorMessage',
				integration: {
					error: '$context.integration.error',
					status: '$context.integration.status',
					requestId: '$context.integration.requestId',
					integrationStatus: '$context.integration.integrationStatus',
					latency: '$context.integration.latency', // The integration latency in ms. Equivalent to $context.integrationLatency.
				},
				authorize: {
					error: '$context.authorize.error',
					latency: '$context.authorize.latency',
					status: '$context.authorize.status', // The status code returned from an authorization attempt.
				},
				authorizer: {
					error: '$context.authorizer.error',
					integrationLatency: '$context.authorizer.integrationLatency',
					integrationStatus: '$context.authorizer.integrationStatus',
					latency: '$context.authorizer.latency',
					requestId: '$context.authorizer.requestId',
					status: '$context.authorizer.status', // The status code returned from an authorizer.
				},
				authenticate: {
					error: '$context.authenticate.error',
					latency: '$context.authenticate.latency',
					status: '$context.authenticate.status', // The status code returned from an authentication attempt.
				},
				xrayTraceId: '$context.xrayTraceId', // The trace ID for the X-Ray trace. For more information, see Setting up AWS X-Ray with API Gateway REST APIs.
			}),
		}
		stage.node.addDependency(apiLogs)
	}
}
