import { SSMClient } from '@aws-sdk/client-ssm'
import { type logFn } from '../../../cli/log.js'
import { type ScopeContext } from '../../../settings/scope.js'
import { readFilesFromMap } from './readFilesFromMap.js'
import { put } from '@bifravst/aws-ssm-settings-helpers'

export const storeCertificateInSSM =
	({ ssm, stackName }: { ssm: SSMClient; stackName: string }) =>
	async (
		{ scope, context }: ScopeContext,
		certsMap: Record<string, string>,
		debug?: logFn,
	): Promise<void> => {
		const certContents = await readFilesFromMap(certsMap)
		for (const [k, content] of Object.entries(certContents)) {
			debug?.(`Storing certificate in settings:`, k)
			await put(ssm)({
				stackName,
				scope,
				context,
			})({
				property: k,
				value: content,
			})
		}
	}
