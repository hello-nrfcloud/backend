import { SSMClient } from '@aws-sdk/client-ssm'
import { type logFn } from '../../../cli/log.js'
import { Scope, getSettingsOptional } from '../../../settings/settings.js'
import { writeFilesFromMap } from './writeFilesFromMap.js'

export const restoreCertificateFromSSM =
	({ ssm, stackName }: { ssm: SSMClient; stackName: string }) =>
	async (
		scope: Scope,
		certificateLocations: Record<string, string>,
		debug?: logFn,
	): Promise<boolean> => {
		debug?.(`Getting settings`, scope)
		const settings = await getSettingsOptional<Record<string, string>, null>({
			ssm,
			stackName,
			scope,
		})(null)
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
