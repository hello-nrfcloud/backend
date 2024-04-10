import { SSMClient } from '@aws-sdk/client-ssm'
import { type logFn } from '../../../cli/log.js'
import { writeFilesFromMap } from './writeFilesFromMap.js'
import { maybe } from '@bifravst/aws-ssm-settings-helpers'
import { type ScopeContext } from '../../../settings/scope.js'

export const restoreCertificateFromSSM =
	({ ssm, stackName }: { ssm: SSMClient; stackName: string }) =>
	async (
		{ scope, context }: ScopeContext,
		certificateLocations: Record<string, string>,
		debug?: logFn,
	): Promise<boolean> => {
		debug?.(`Getting settings`, `${scope}/${context}`)
		const settings = await maybe(ssm)({
			stackName,
			scope,
			context,
		})
		if (settings === null) {
			debug?.(`No certificate stored in settings.`)
			return false
		}

		// Make sure all required locations exist
		for (const k of Object.keys(certificateLocations)) {
			if (settings[k] === undefined) {
				debug?.(`Restored certificate settings are missing key`, k)
				return false
			}
		}

		const locations: Record<string, string> = Object.entries(settings).reduce(
			(locations, [k, v]) => {
				const path = certificateLocations[k]
				if (path === undefined) {
					debug?.(`Unrecognized path:`, k)
					return locations
				}
				return {
					...locations,
					[path]: v,
				}
			},
			{},
		)

		for (const path of Object.keys(locations)) debug?.(`Restoring`, path)
		await writeFilesFromMap(locations)
		return true
	}
