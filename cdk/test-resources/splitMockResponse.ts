export const splitMockResponse = (
	r: string,
): { headers: Record<string, string>; body: string } => {
	const trimmedLines = r
		.split('\n')
		.map((s) => s.trim())
		.join('\n')
	const blankLineLocation = trimmedLines.indexOf('\n\n')
	if (blankLineLocation === -1)
		return {
			headers: {},
			body: trimmedLines,
		}
	return {
		headers: trimmedLines
			.slice(0, blankLineLocation)
			.split('\n')
			.map((s) => s.split(':', 2))
			.reduce(
				(headers, [k, v]) => ({ ...headers, [k as string]: v?.trim() }),
				{},
			),
		body: trimmedLines.slice(blankLineLocation + 2),
	}
}
