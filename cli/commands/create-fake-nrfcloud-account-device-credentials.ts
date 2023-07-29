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
import { chunk } from 'lodash-es'
import { randomUUID } from 'node:crypto'
import { getIoTEndpoint } from '../../aws/getIoTEndpoint.js'
import { STACK_NAME } from '../../cdk/stacks/stackConfig.js'
import { putSettings, type Settings } from '../../nrfcloud/settings.js'
import { isString } from '../../util/isString.js'
import { Scope, settingsPath } from '../../util/settings.js'
import type { CommandDefinition } from './CommandDefinition.js'

export const createFakeNrfCloudAccountDeviceCredentials = ({
	iot,
	ssm,
}: {
	iot: IoTClient
	ssm: SSMClient
}): CommandDefinition => ({
	command: 'fake-nrfcloud-account-device <account>',
	options: [
		{
			flags: '-X, --remove',
			description: `remove the fake device`,
		},
	],
	action: async (account, { remove }) => {
		const scope = `${Scope.NRFCLOUD_ACCOUNT_PREFIX}/${account}`
		const fakeTenantParameter = `/${STACK_NAME}/${account}/fakeTenant`
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
				throw new Error(
					`${STACK_NAME}/${account} has no fake nRF Cloud Account device`,
				)
			}
			const policyName = `fake-nrfcloud-account-device-policy-${fakeTenant}`
			const targets = await iot.send(
				new ListTargetsForPolicyCommand({
					policyName,
				}),
			)

			for (const target of targets.targets ?? []) {
				console.debug(
					chalk.magenta(`Detaching "${policyName}" policy from ${target}`),
				)
				await iot.send(
					new DetachPolicyCommand({
						policyName,
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
					policyName,
				}),
			)

			console.debug(chalk.magenta(`Deleting parameters`))
			const parameters = await ssm.send(
				new GetParametersByPathCommand({
					Path: settingsPath({
						stackName: STACK_NAME,
						scope,
					}),
				}),
			)

			const names = [
				...(parameters.Parameters?.map((p) => p.Name) ?? []),
				fakeTenantParameter,
			]
			const namesChunk = chunk(names, 10)
			for (const names of namesChunk) {
				await ssm.send(
					new DeleteParametersCommand({
						Names: names as string[],
					}),
				)
			}

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

		const settings: Partial<Settings> = {
			accountDeviceClientCert: credentials.certificatePem,
			accountDevicePrivateKey: pk,
			accountDeviceClientId: `account-${tenantId}`,
			mqttEndpoint: await getIoTEndpoint({ iot })(),
			mqttTopicPrefix: `prod/${tenantId}/`,
		}
		await putSettings({
			ssm,
			stackName: STACK_NAME,
			account,
		})(settings)

		console.debug(chalk.white(`nRF Cloud settings:`))
		Object.entries(settings).forEach(([k, v]) => {
			console.debug(chalk.yellow(`${k}:`), chalk.blue(v))
		})

		await ssm.send(
			new PutParameterCommand({
				Name: fakeTenantParameter,
				Value: tenantId,
				Type: 'String',
				Overwrite: true,
			}),
		)
	},
	help: 'Creates IoT hub credentials used by the MQTT bridge to connect to',
})
