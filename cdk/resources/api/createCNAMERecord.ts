import {
	ChangeResourceRecordSetsCommand,
	ListHostedZonesByNameCommand,
	Route53Client,
} from '@aws-sdk/client-route-53'
import { AssumeRoleCommand, STSClient } from '@aws-sdk/client-sts'
import type { CloudFormationCustomResourceEvent, Context } from 'aws-lambda'
import response from 'cfn-response'

export const handler = (
	event: CloudFormationCustomResourceEvent,
	context: Context,
): void => {
	console.debug(JSON.stringify({ event }))
	if (event.RequestType === 'Delete') {
		console.debug(`Delete not allowed.`)
		return response.send(event, context, 'SUCCESS')
	}
	updateCNAMERecord(event)
		.then((physicalResourceId) =>
			response.send(event, context, 'SUCCESS', {
				physicalResourceId,
			}),
		)
		.catch((error) => {
			console.error(error)
			response.send(event, context, 'FAILED')
		})
}

const updateCNAMERecord = async (
	event: CloudFormationCustomResourceEvent,
): Promise<string> => {
	const { roleArn, domainName, cnameValue } = event.ResourceProperties

	const sts = new STSClient()
	const assumeRoleResponse = await sts.send(
		new AssumeRoleCommand({
			RoleArn: roleArn,
			RoleSessionName: 'CreateCnameSession',
		}),
	)

	if (assumeRoleResponse.Credentials === undefined)
		throw new Error(`Failed to assume to role: ${roleArn}!`)

	const { AccessKeyId, SecretAccessKey, SessionToken, Expiration } =
		assumeRoleResponse.Credentials

	const route53 = new Route53Client({
		credentials: {
			accessKeyId: AccessKeyId!,
			secretAccessKey: SecretAccessKey!,
			sessionToken: SessionToken!,
			expiration: Expiration!,
		},
	})

	const { HostedZones } = await route53.send(
		new ListHostedZonesByNameCommand({}),
	)

	const [tld, domain] = domainName.split('.').reverse()
	const apexDomain = `${domain}.${tld}.`
	const HostedZoneId = HostedZones?.find(({ Name }) => Name === apexDomain)?.Id

	if (HostedZoneId === undefined)
		throw new Error(`Hosted zone for ${apexDomain} not found!`)

	console.debug(`Hosted zone for ${apexDomain} found: ${HostedZoneId}`)

	await route53.send(
		new ChangeResourceRecordSetsCommand({
			HostedZoneId,
			ChangeBatch: {
				Changes: [
					{
						Action: 'UPSERT',
						ResourceRecordSet: {
							Name: domainName,
							Type: 'CNAME',
							TTL: 600,
							ResourceRecords: [
								{
									Value: cnameValue,
								},
							],
						},
					},
				],
			},
		}),
	)

	console.debug(`CNAME record ${domainName} set to ${cnameValue}`)

	return `${domainName}:CNAME:${cnameValue}`
}
