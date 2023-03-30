export const compareSemanticVersions = (a: string, b: string): number => {
	const a1 = a.split('.')
	const b1 = b.split('.')

	const len = Math.min(a1.length, b1.length)
	for (let i = 0; i < len; i++) {
		const a2 = +(a1[i] ?? 0)
		const b2 = +(b1[i] ?? 0)

		if (a2 !== b2) {
			return a2 > b2 ? 1 : -1
		}
	}

	return a1.length - b1.length
}
