/**
 * Corrects an offset of up to 60 seconds in the future.
 * This is needed because some devices clocks drift, and they report timestamps in the future.
 */
export const correctOffset = (ts: number, maxOffsetSeconds = 60): number => {
	const nowSeconds = Math.ceil(Date.now() / 1000)
	const offset = ts * 1000 - nowSeconds
	if (offset < 0) {
		return ts
	}
	return ts - Math.min(offset, maxOffsetSeconds)
}
