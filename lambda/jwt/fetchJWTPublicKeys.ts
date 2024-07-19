export const fetchJWTPublicKeys = async (
	jwksURL: URL,
	onError?: (err: Error) => void,
): Promise<Map<string, string>> => {
	try {
		const res = await fetch(jwksURL.toString())
		const jwks = await res.json()
		const keys = jwks.keys as Array<{ kid: string; key: string }>
		return new Map(keys.map((key) => [key.kid, key.key]))
	} catch (err) {
		onError?.(err as Error)
		return new Map()
	}
}
