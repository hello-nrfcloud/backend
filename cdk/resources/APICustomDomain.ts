import { Construct } from 'constructs'
import type { Reference } from 'aws-cdk-lib'
import { aws_apigatewayv2 as HttpApi, ResolutionTypeHint } from 'aws-cdk-lib'
import type { DomainCert } from '../../aws/acm.js'
import type { API } from './API.js'

export class APICustomDomain extends Construct {
	public readonly URL: string
	/**
	 * The hostname of the ApiMapping
	 */
	public readonly gatewayDomainName: Reference

	constructor(
		parent: Construct,
		{ api, apiDomain }: { api: API; apiDomain: DomainCert },
	) {
		super(parent, 'apiDomain')

		const domain = new HttpApi.CfnDomainName(this, 'apiDomain', {
			domainName: apiDomain.domain,
			domainNameConfigurations: [
				{
					certificateArn: apiDomain.certificateArn,
				},
			],
		})
		new HttpApi.CfnApiMapping(this, 'apiDomainMapping', {
			apiId: api.api.ref,
			domainName: apiDomain.domain,
			stage: api.stage.ref,
			apiMappingKey: api.stage.stageName, // so the api is accessed via the same resource, e.g. https://api.hello.nordicsemi.cloud/2024-04-15/
		}).node.addDependency(domain)

		this.URL = `https://${apiDomain.domain}/${api.stage.stageName}/`
		this.gatewayDomainName = domain.getAtt(
			'RegionalDomainName',
			ResolutionTypeHint.STRING,
		)
	}
}
