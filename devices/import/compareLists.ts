export const compareLists = (
	a: Map<string, { fingerprint: string }>,
	b: Map<string, { fingerprint: string }>,
): boolean => {
	for (const [IMEI, { fingerprint }] of a.entries()) {
		if (!b.has(IMEI)) {
			return false
		}
		if (b.get(IMEI)?.fingerprint !== fingerprint) {
			return false
		}
	}
	return true
}
