import { createInMemoryCache } from './inMemoryCache.js'

describe('createInMemoryCache', () => {
	const cache = createInMemoryCache<string>()

	it('should return undefined for non-existent key', () => {
		expect(cache.get('nonexistent-key')).toBeNull()
	})

	it('should return cached value for valid key', () => {
		cache.set('my-key', 'my-value', 60)
		expect(cache.get('my-key')).toEqual('my-value')
	})

	it('should return undefined for expired key', async () => {
		cache.set('my-key', 'my-value', 1)
		// Wait for cache item to expire
		return new Promise((resolve) => setTimeout(resolve, 1000)).then(() => {
			expect(cache.get('my-key')).toBeNull()
		})
	})
})
