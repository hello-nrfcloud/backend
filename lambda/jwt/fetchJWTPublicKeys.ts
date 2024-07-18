export const fetchJWTPublicKeys = async (
	jwksURL: URL,
): Promise<Map<string, string>> => {
	const res = await fetch(jwksURL.toString())
	const jwks = await res.json()
	const keys = jwks.keys as Array<{ kid: string; key: string }>
	return new Map(keys.map((key) => [key.kid, key.key]))
}
