import type { IoTClient } from '@aws-sdk/client-iot'
import {
	AttachPolicyCommand,
	CreateKeysAndCertificateCommand,
} from '@aws-sdk/client-iot'
import type { SSMClient } from '@aws-sdk/client-ssm'
import { GetParameterCommand } from '@aws-sdk/client-ssm'
import { generateCode } from '@hello.nrfcloud.com/proto/fingerprint'
import chalk from 'chalk'
import { randomUUID } from 'node:crypto'
import { STACK_NAME } from '../../cdk/stackConfig.js'
import {
	updateSettings,
	type Settings,
} from '../../settings/health-check/device.js'
import { isString } from '../../util/isString.js'
import type { CommandDefinition } from './CommandDefinition.js'

export const createFakeNrfCloudHealthCheckDevice = ({
	iot,
	ssm,
}: {
	iot: IoTClient
	ssm: SSMClient
}): CommandDefinition => ({
	command: 'create-fake-nrfcloud-health-check-device <account>',
	action: async (account) => {
		const deviceId = `health-check-${randomUUID()}`

		const fakeTenantParameter = `/${STACK_NAME}/${account}/fakeTenant`
		const tenantId = (
			await ssm.send(
				new GetParameterCommand({
					Name: fakeTenantParameter,
				}),
			)
		).Parameter?.Value
		if (tenantId === undefined) {
			throw new Error(
				`${STACK_NAME}/${account} has no fake nRF Cloud Account device`,
			)
		}

		const policyName = `fake-nrfcloud-account-device-policy-${tenantId}`
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
			healthCheckClientCert: credentials.certificatePem,
			healthCheckPrivateKey: pk,
			healthCheckClientId: deviceId,
			healthCheckModel: 'PCA20065',
			healthCheckFingerPrint: `29a.${generateCode()}`,
		}
		await updateSettings({ ssm, stackName: STACK_NAME, account })(settings)

		console.debug(chalk.white(`Fake nRF Cloud health check device settings:`))
		Object.entries(settings).forEach(([k, v]) => {
			console.debug(chalk.yellow(`${k}:`), chalk.blue(v))
		})
	},
	help: 'Creates fake nRF Cloud health check device used by the stack to end-to-end health check',
})
