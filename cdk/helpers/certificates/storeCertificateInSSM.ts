import type { SSMClient } from '@aws-sdk/client-ssm'
import { put } from '@bifravst/aws-ssm-settings-helpers'
import { type logFn } from '../../../cli/log.ts'
import { type ScopeContext } from '../../../settings/scope.ts'
import { readFilesFromMap } from './readFilesFromMap.ts'

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
