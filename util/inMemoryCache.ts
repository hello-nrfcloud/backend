type CacheItem<T> = {
	value: T
	expiry: number
}

export const createInMemoryCache = <T>(): {
	get: (key: string) => T | null
	set: (key: string, value: T, ttlSeconds: number) => void
} => {
	const cache: Record<string, CacheItem<T>> = {}

	return {
		get: (key) => {
			const item = cache[key]
			if (item === undefined) return null

			if (Date.now() < item.expiry) {
				return item.value
			}
			delete cache[key]
			return null
		},

		set: (key, value, ttlSeconds) => {
			cache[key] = {
				value,
				expiry: Date.now() + ttlSeconds * 1000,
			}
		},
	}
}
