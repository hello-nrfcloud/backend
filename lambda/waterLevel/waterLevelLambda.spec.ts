import { waterLevelFunction } from './waterLevelLambda.js'
import { describe, it } from 'node:test'

describe('waterLevelFunction()', () => {
	it('should get the water level', async () => {
		await waterLevelFunction()
	})
})
