import { SSMClient } from '@aws-sdk/client-ssm'
import { type logFn } from '../../../cli/log.js'
import { Scope, putSettings } from '../../../settings/settings.js'
import { readFilesFromMap } from './readFilesFromMap.js'

export const storeCertificateInSSM =
	({ ssm, stackName }: { ssm: SSMClient; stackName: string }) =>
	async (
		scope: Scope,
		certsMap: Record<string, string>,
		debug?: logFn,
	): Promise<void> => {
		const certContents = await readFilesFromMap(certsMap)
		for (const [k, content] of Object.entries(certContents)) {
			debug?.(`Storing certificate in settings:`, k)
			await putSettings({
				ssm,
				stackName,
				scope,
			})({
				property: k,
				value: content,
			})
		}
	}
