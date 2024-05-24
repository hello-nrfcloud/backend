import type { aws_lambda as Lambda } from 'aws-cdk-lib'
import { aws_apigatewayv2 as HttpApi, aws_iam as IAM, Stack } from 'aws-cdk-lib'
import { Construct } from 'constructs'

export const integrationUri = (parent: Stack, f: Lambda.IFunction): string =>
	`arn:aws:apigateway:${parent.region}:lambda:path/2015-03-31/functions/arn:aws:lambda:${parent.region}:${parent.account}:function:${f.functionName}/invocations`

export class ApiRoute extends Construct {
	public readonly route: HttpApi.CfnRoute
	constructor(
		parent: Construct,
		id: string,
		{
			function: fn,
			api,
			stage,
			method,
			resource,
		}: {
			function: Lambda.IFunction
			api: HttpApi.CfnApi
			stage: HttpApi.CfnStage
			method: Lambda.HttpMethod
			resource: string
		},
	) {
		super(parent, id)

		const integration = new HttpApi.CfnIntegration(this, 'Integration', {
			apiId: api.ref,
			integrationType: 'AWS_PROXY',
			integrationUri: integrationUri(Stack.of(parent), fn),
			integrationMethod: 'POST',
			payloadFormatVersion: '2.0',
		})

		this.route = new HttpApi.CfnRoute(this, `Route`, {
			apiId: api.ref,
			routeKey: `${method} ${resource}`,
			target: `integrations/${integration.ref}`,
			authorizationType: 'NONE',
		})

		fn.addPermission(
			`invokeByHttpApi-${method}-${resource.slice(1).replaceAll('/', '_')}`,
			{
				principal: new IAM.ServicePrincipal('apigateway.amazonaws.com'),
				sourceArn: `arn:aws:execute-api:${Stack.of(parent).region}:${Stack.of(parent).account}:${api.ref}/${stage.stageName}/${method}${resource}`,
			},
		)
	}
}
