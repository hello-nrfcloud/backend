import {
	Duration,
	aws_apigatewayv2 as HttpApi,
	aws_lambda as Lambda,
	Stack,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import type { DeviceStorage } from './DeviceStorage.js'
import type { BackendLambdas } from '../packBackendLambdas.js'
import { LambdaLogGroup } from '@bifravst/aws-cdk-lambda-helpers/cdk'
import { ApiRoute } from './ApiRoute.js'

export class API extends Construct {
	public readonly api: HttpApi.CfnApi
	public readonly stage: HttpApi.CfnStage
	public readonly deployment: HttpApi.CfnDeployment
	public readonly URL: string

	constructor(
		parent: Construct,
		{
			deviceStorage,
			lambdaSources,
			layers,
		}: {
			deviceStorage: DeviceStorage
			lambdaSources: Pick<BackendLambdas, 'getDeviceByFingerprint'>
			layers: Lambda.ILayerVersion[]
		},
	) {
		super(parent, 'api')

		const stageName = '2024-04-17'

		this.api = new HttpApi.CfnApi(this, 'api', {
			name: 'hello.nrfcloud.com/map API',
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

		// Sharing Status
		const getDeviceByFingerprint = new Lambda.Function(
			this,
			'getDeviceByFingerprintFn',
			{
				handler: lambdaSources.getDeviceByFingerprint.handler,
				architecture: Lambda.Architecture.ARM_64,
				runtime: Lambda.Runtime.NODEJS_20_X,
				timeout: Duration.seconds(1),
				memorySize: 1792,
				code: Lambda.Code.fromAsset(
					lambdaSources.getDeviceByFingerprint.zipFile,
				),
				description:
					'Returns information for a device identified by the fingerprint.',
				layers,
				environment: {
					VERSION: this.node.getContext('version'),
					DEVICES_TABLE_NAME: deviceStorage.devicesTable.tableName,
					DEVICES_INDEX_NAME: deviceStorage.devicesTableFingerprintIndexName,
					NODE_NO_WARNINGS: '1',
				},
				...new LambdaLogGroup(this, 'getDeviceByFingerprintFnLogs'),
			},
		)
		deviceStorage.devicesTable.grantReadData(getDeviceByFingerprint)
		this.addRoute('GET /device', getDeviceByFingerprint)
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
	}
}

const isMethod = (method?: string): method is Lambda.HttpMethod =>
	['GET', 'PUT', 'HEAD', 'POST', 'DELETE', 'PATCH'].includes(method ?? '')
