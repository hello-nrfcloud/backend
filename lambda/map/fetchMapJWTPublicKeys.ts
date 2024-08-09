import type { SSMClient } from '@aws-sdk/client-ssm'
import { fetchJWTPublicKeys } from '../../jwt/fetchJWTPublicKeys.js'
import { getMapSettings } from '../../settings/map.js'

export const fetchMapJWTPublicKeys = async ({
	ssm,
	stackName,
	onError,
	debug,
}: {
	ssm: SSMClient
	stackName: string
	onError?: (err: Error, url: URL) => void
	debug?: (...args: string[]) => void
}): Promise<Map<string, string>> => {
	const mapJWKS = new URL(
		'./2024-04-15/.well-known/jwks.json',
		(await getMapSettings({ ssm, stackName })).apiEndpoint,
	)
	return fetchJWTPublicKeys(
		mapJWKS,
		(err) => onError?.(err, mapJWKS),
		(...args) => debug?.(`[fetchMapJWTPublicKeys]`, ...args),
	)
}
