import {
	AttachPolicyCommand,
	CertificateStatus,
	CreateKeysAndCertificateCommand,
	CreatePolicyCommand,
	DeleteCertificateCommand,
	DeletePolicyCommand,
	DetachPolicyCommand,
	IoTClient,
	ListTargetsForPolicyCommand,
	UpdateCertificateCommand,
} from '@aws-sdk/client-iot'
import {
	DeleteParametersCommand,
	GetParameterCommand,
	GetParametersByPathCommand,
	PutParameterCommand,
	SSMClient,
} from '@aws-sdk/client-ssm'
import chalk from 'chalk'
import { randomUUID } from 'node:crypto'
import { getIoTEndpoint } from '../../aws/getIoTEndpoint'
import { STACK_NAME } from '../../cdk/stacks/stackConfig'
import { updateSettings, type Settings } from '../../nrfcloud/settings'
import { isString } from '../../util/isString'
import { settingsPath } from '../../util/settings'
import type { CommandDefinition } from './CommandDefinition'

export const createFakeNrfCloudAccountDeviceCredentials = ({
	iot,
	ssm,
}: {
	iot: IoTClient
	ssm: SSMClient
}): CommandDefinition => ({
	command: 'fake-nrfcloud-account-device',
	options: [
		{
			flags: '-X, --remove',
			description: `remove the fake device`,
		},
	],
	action: async ({ remove }) => {
		const fakeTenantParameter = `/${STACK_NAME}/fakeTenant`
		if (remove === true) {
			// check if has fake device
			const fakeTenant = (
				await ssm.send(
					new GetParameterCommand({
						Name: fakeTenantParameter,
					}),
				)
			).Parameter?.Value
			if (fakeTenant === undefined) {
				throw new Error(`${STACK_NAME} has no fake nRF Cloud Account device`)
			}
			const policyName = `fake-nrfcloud-account-device-policy-${fakeTenant}`
			const targets = await iot.send(
				new ListTargetsForPolicyCommand({
					policyName: policyName,
				}),
			)

			for (const target of targets.targets ?? []) {
				console.debug(
					chalk.magenta(`Detaching "${policyName}" policy from ${target}`),
				)
				await iot.send(
					new DetachPolicyCommand({
						policyName: policyName,
						target,
					}),
				)

				const certificateId = target.split('/')[1]
				console.debug(
					chalk.magenta(`De-activating certificate "${certificateId}"`),
				)
				await iot.send(
					new UpdateCertificateCommand({
						certificateId,
						newStatus: CertificateStatus.INACTIVE,
					}),
				)

				console.debug(chalk.magenta(`Deleting certificate "${certificateId}"`))
				await iot.send(
					new DeleteCertificateCommand({
						certificateId,
						forceDelete: true,
					}),
				)
			}

			console.debug(chalk.magenta(`Deleting "${policyName}" policy`))
			await iot.send(
				new DeletePolicyCommand({
					policyName: policyName,
				}),
			)

			console.debug(chalk.magenta(`Deleting parameters`))
			const parameters = await ssm.send(
				new GetParametersByPathCommand({
					Path: settingsPath({
						stackName: STACK_NAME,
						scope: 'thirdParty',
						system: 'nrfcloud',
					}),
				}),
			)

			const names = [
				...(parameters.Parameters?.map((p) => p.Name) ?? []),
				fakeTenantParameter,
			]
			await ssm.send(
				new DeleteParametersCommand({
					Names: names as string[],
				}),
			)
			return
		}
		const tenantId = randomUUID()
		const policyName = `fake-nrfcloud-account-device-policy-${tenantId}`
		console.debug(chalk.magenta(`Creating policy`), chalk.blue(policyName))
		await iot.send(
			new CreatePolicyCommand({
				policyDocument: JSON.stringify({
					Version: '2012-10-17',
					Statement: [{ Effect: 'Allow', Action: 'iot:*', Resource: '*' }],
				}),
				policyName,
			}),
		)

		console.debug(chalk.magenta(`Creating IoT certificate`))
		const credentials = await iot.send(
			new CreateKeysAndCertificateCommand({
				setAsActive: true,
			}),
		)

		console.debug(chalk.magenta(`Attaching policy to IoT certificate`))
		await iot.send(
			new AttachPolicyCommand({
				policyName,
				target: credentials.certificateArn,
			}),
		)

		const pk = credentials.keyPair?.PrivateKey
		if (
			!isString(credentials.certificatePem) ||
			!isString(pk) ||
			!isString(credentials.certificateArn)
		) {
			throw new Error(`Failed to create certificate!`)
		}

		const settings: Settings = {
			accountDeviceClientCert: credentials.certificatePem,
			accountDevicePrivateKey: pk,
			accountDeviceClientId: `account-${tenantId}`,
			apiEndpoint: 'https://example.com',
			apiKey: 'apiKey',
			mqttEndpoint: await getIoTEndpoint({ iot })(),
			mqttTopicPrefix: `prod/${tenantId}/`,
		}
		await updateSettings({ ssm, stackName: STACK_NAME })(settings)

		console.debug(chalk.white(`nRF Cloud settings:`))
		Object.entries(settings).forEach(([k, v]) => {
			console.debug(chalk.yellow(`${k}:`), chalk.blue(v))
		})

		await ssm.send(
			new PutParameterCommand({
				Name: fakeTenantParameter,
				Value: tenantId,
				Type: 'String',
			}),
		)
	},
	help: 'Creates IoT hub credentials used by the MQTT bridge to connect to',
})
