import type { aws_lambda as Lambda } from 'aws-cdk-lib'
import { aws_apigatewayv2 as HttpApi, Stack } from 'aws-cdk-lib'
import { Construct } from 'constructs'
import { ApiRoute } from './ApiRoute.js'

export class API extends Construct {
	public readonly api: HttpApi.CfnApi
	public readonly stage: HttpApi.CfnStage
	public readonly deployment: HttpApi.CfnDeployment
	public readonly URL: string

	constructor(parent: Construct) {
		super(parent, 'api')

		const stageName = '2024-04-17'

		this.api = new HttpApi.CfnApi(this, 'api', {
			name: 'hello.nrfcloud.com API',
			protocolType: 'HTTP',
		})

		this.stage = new HttpApi.CfnStage(this, 'stage', {
			apiId: this.api.ref,
			stageName,
			autoDeploy: true,
		})

		this.deployment = new HttpApi.CfnDeployment(this, 'deployment', {
			apiId: this.api.ref,
			stageName: this.stage.stageName,
		})
		this.deployment.node.addDependency(this.stage)
		this.URL = `https://${this.api.ref}.execute-api.${Stack.of(this).region}.amazonaws.com/${this.stage.stageName}/`
	}

	public addRoute(methodAndRoute: string, fn: Lambda.IFunction): void {
		const [method, resource] = methodAndRoute.split(' ', 2)
		if (!isMethod(method)) throw new Error(`${method} is not a HTTP method.`)
		if (resource === undefined) throw new Error(`Must provide a route`)
		if (!resource.startsWith('/'))
			throw new Error(`Route ${resource} must start with a slash!`)
		const id = resource.replaceAll(/[^a-z0-9]/gi, '_')
		const { route } = new ApiRoute(this, `${method}-${id}-Route`, {
			api: this.api,
			stage: this.stage,
			function: fn,
			method,
			resource,
		})
		this.deployment.node.addDependency(route)
		// Add OPTIONS route for CORS
		const { route: CORS } = new ApiRoute(this, `OPTIONS-${id}-Route`, {
			api: this.api,
			stage: this.stage,
			function: fn,
			method: 'OPTIONS' as Lambda.HttpMethod,
			resource,
		})
		this.deployment.node.addDependency(CORS)
	}
}

const isMethod = (method?: string): method is Lambda.HttpMethod =>
	['GET', 'PUT', 'HEAD', 'POST', 'DELETE', 'PATCH'].includes(method ?? '')
