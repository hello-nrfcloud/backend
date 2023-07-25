export const parseMockResponse = (
	r: string,
): {
	statusCode: number
	protocol: string // 'HTTP/1.0' | 'HTTP/1.1'
	headers: Record<string, string>
	body: string
} => {
	const lines = r.split('\n')
	const protocolStatusCode = lines.shift()
	const blankLineLocation = lines.indexOf('')
	const headerLines =
		blankLineLocation === -1 ? lines : lines.slice(0, blankLineLocation)
	const body =
		blankLineLocation === -1
			? ''
			: lines.slice(blankLineLocation + 1).join('\n')

	const responseInfo =
		/^(?<protocol>HTTP\/[0-9.]+) (?<statusCode>[0-9]+) /.exec(
			protocolStatusCode ?? '',
		)?.groups as { statusCode: string; protocol: string }

	if (responseInfo === null)
		throw new Error(`Invalid request info: ${protocolStatusCode}`)

	return {
		statusCode: parseInt(responseInfo.statusCode, 10),
		protocol: responseInfo.protocol,
		headers: headerLines
			.map((s) => s.split(':', 2))
			.reduce((headers, [k, v]) => ({ ...headers, [k ?? '']: v?.trim() }), {}),
		body,
	}
}
