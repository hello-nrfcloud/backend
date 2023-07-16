import type { SSMClient } from '@aws-sdk/client-ssm'
import { STACK_NAME } from '../cdk/stacks/stackConfig.js'
import { getSettingsOptional, putSettings } from '../util/settings.js'
import type { CAFiles } from './caLocation.js'
import { readFile, writeFile } from 'node:fs/promises'
import type { CertificateFiles } from './mqttBridgeCertificateLocation.js'
import type { logFn } from '../cli/log.js'

export const backupCertificatesToSSM = async ({
	ssm,
	parameterNamePrefix,
	certificates,
	debug,
}: {
	ssm: SSMClient
	parameterNamePrefix: string
	debug?: logFn
	certificates: CAFiles | CertificateFiles
}): Promise<void> => {
	debug?.(`Writing to SSM`)
	await Promise.all(
		Object.entries(certificates).map(async ([k, v]) =>
			putSettings({
				ssm,
				stackName: STACK_NAME,
				scope: 'codebuild',
				system: 'stack',
			})({
				property: `${parameterNamePrefix}_${k}`,
				value: await readFile(v, { encoding: 'utf-8' }),
			}),
		),
	)
}

export const restoreCertificatesFromSSM = async ({
	ssm,
	parameterNamePrefix,
	certificates,
	debug,
}: {
	ssm: SSMClient
	parameterNamePrefix: string
	certificates: CAFiles | CertificateFiles
	debug?: logFn
}): Promise<void> => {
	const parameters = await getSettingsOptional<Record<string, string>, null>({
		ssm,
		stackName: STACK_NAME,
		scope: 'codebuild',
		system: 'stack',
	})(null)

	if (parameters === null) return

	const result: Record<string, Record<string, string>> = {}
	for (const [key, value] of Object.entries(parameters)) {
		const [groupName, nestedKey] = key.split('_')
		if (groupName !== undefined && nestedKey !== undefined) {
			const group = result[groupName] ?? {}
			group[nestedKey] = value
			result[groupName] = group
		}
	}

	if (parameterNamePrefix in result) {
		const certificatesInSSM = result[parameterNamePrefix] ?? {}
		for (const key in certificates) {
			if (key in certificatesInSSM) {
				const content = certificatesInSSM[key] ?? ''
				const filename =
					certificates[key as keyof CAFiles & keyof CertificateFiles]
				debug?.(`Writing file ${filename}`)
				await writeFile(filename, content, { encoding: 'utf-8' })
			}
		}
	}
}
