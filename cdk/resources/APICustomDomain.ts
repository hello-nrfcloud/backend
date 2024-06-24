import { Construct } from 'constructs'
import {
	CustomResource,
	aws_apigatewayv2 as HttpApi,
	ResolutionTypeHint,
} from 'aws-cdk-lib'
import type { API } from './API.js'
import type { BackendLambdas } from '../packBackendLambdas.js'
import { PackedLambdaFn } from '@bifravst/aws-cdk-lambda-helpers/cdk'

export type CustomDomain = {
	domainName: string
	certificateArn: string
	// This is the ARN of the role to assume to update the CNAME record
	roleArn: string
	// The region that hosts the domain zone
	region: string
}

export class APICustomDomain extends Construct {
	public readonly URL: string

	constructor(
		parent: Construct,
		{
			api,
			apiDomain,
			lambdaSources,
		}: {
			api: API
			apiDomain: CustomDomain
			lambdaSources: Pick<BackendLambdas, 'createCNAMERecord'>
		},
	) {
		super(parent, 'apiDomain')

		const domain = new HttpApi.CfnDomainName(this, 'apiDomain', {
			domainName: apiDomain.domainName,
			domainNameConfigurations: [
				{
					certificateArn: apiDomain.certificateArn,
				},
			],
		})
		new HttpApi.CfnApiMapping(this, 'apiDomainMapping', {
			apiId: api.api.ref,
			domainName: apiDomain.domainName,
			stage: api.stage.ref,
			apiMappingKey: api.stage.stageName, // so the api is accessed via the same resource, e.g. https://api.hello.nordicsemi.cloud/2024-04-15/
		}).node.addDependency(domain)

		this.URL = `https://${apiDomain.domainName}/${api.stage.stageName}/`

		const createCNAMERecordFn = new PackedLambdaFn(
			this,
			'createCNAMERecordFn',
			lambdaSources.createCNAMERecord,
			{},
		)

		new CustomResource(this, 'apiDomainCNAMERecord', {
			serviceToken: createCNAMERecordFn.fn.functionArn,
			properties: {
				roleArn: apiDomain.roleArn,
				domainName: apiDomain.domainName,
				cnameValue: domain.getAtt(
					'RegionalDomainName',
					ResolutionTypeHint.STRING,
				),
				region: apiDomain.region,
			},
		})
	}
}
