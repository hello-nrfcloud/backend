export const parseMockRequest = (
	r: string,
): {
	method: string
	resource: string
	protocol: string // 'HTTP/1.0' | 'HTTP/1.1'
	headers: Record<string, string>
	body: string
} => {
	const lines = r.split('\n')
	const methodResourceProtol = lines.shift()
	const blankLineLocation = lines.indexOf('')
	const headerLines =
		blankLineLocation === -1 ? lines : lines.slice(0, blankLineLocation)
	const body =
		blankLineLocation === -1
			? ''
			: lines.slice(blankLineLocation + 1).join('\n')

	const requestInfo =
		/^(?<method>[A-Z]+) (?<resource>[^ ]+) (?<protocol>HTTP\/[0-9.]+)/.exec(
			methodResourceProtol ?? '',
		)?.groups as { method: string; resource: string; protocol: string }

	if (requestInfo === null)
		throw new Error(`Invalid request info: ${methodResourceProtol}`)

	return {
		...requestInfo,
		headers: headerLines
			.map((s) => s.split(':', 2))
			.reduce((headers, [k, v]) => ({ ...headers, [k ?? '']: v?.trim() }), {}),
		body,
	}
}
