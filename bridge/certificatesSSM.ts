import type { SSMClient } from '@aws-sdk/client-ssm'
import { STACK_NAME } from '../cdk/stacks/stackConfig.js'
import { Scope, getSettingsOptional } from '../util/settings.js'
import type { CAFiles } from './caLocation.js'
import type { CertificateFiles } from './mqttBridgeCertificateLocation.js'
import type { logFn } from '../cli/log.js'

export const restoreCertificatesFromSSM = async ({
	ssm,
	parameterNamePrefix,
	certificates,
	debug,
	writer,
}: {
	ssm: SSMClient
	parameterNamePrefix: string
	certificates: CAFiles | CertificateFiles
	writer: (filename: string, data: string) => Promise<void>
	debug?: logFn
}): Promise<boolean> => {
	let hasRestored = false

	const parameters = await getSettingsOptional<Record<string, string>, null>({
		ssm,
		stackName: STACK_NAME,
		scope: Scope.NRFCLOUD_BRIDGE_CONFIG,
	})(null)

	if (parameters === null) return false

	if (parameterNamePrefix in parameters) {
		const certificatesInSSM = parameters[parameterNamePrefix]
		for (const key in certificates) {
			if (typeof certificatesInSSM === 'object' && key in certificatesInSSM) {
				const content = certificatesInSSM[key] ?? ''
				const filename =
					certificates[key as keyof CAFiles & keyof CertificateFiles]
				debug?.(`Writing file ${filename}`)
				await writer(filename, content)
				hasRestored = true
			}
		}
	}

	return hasRestored
}
