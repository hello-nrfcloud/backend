export const isUnixTimeInSeconds = (value: unknown): value is number => {
	if (typeof value !== 'number') return false
	if (value < 1700000000) return false
	if (value * 1000 > Date.now()) return false
	return true
}
