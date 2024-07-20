export const fetchJWTPublicKeys = async (
	jwksURL: URL,
	onError?: (err: Error) => void,
	debug?: (...args: string[]) => void,
): Promise<Map<string, string>> => {
	try {
		debug?.('[fetchJWTPublicKeys]', 'url', jwksURL.toString())
		const res = await fetch(jwksURL.toString())
		const jwks = await res.json()

		debug?.('[fetchJWTPublicKeys]', 'JWKS', JSON.stringify(jwks, null, 2))
		const keys = jwks.keys as Array<{ kid: string; key: string }>
		return new Map(keys.map((key) => [key.kid, key.key]))
	} catch (err) {
		onError?.(err as Error)
		return new Map()
	}
}
