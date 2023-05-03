export const ensureNumber = (value: unknown, defaultValue: number): number => {
	const converted = Number(value)
	return isNaN(converted) ? defaultValue : converted
}
