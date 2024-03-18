import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { isNumeric } from './isNumeric.js'
import { ResourceType } from '@hello.nrfcloud.com/proto-map'

void describe('isNumeric', () => {
	void it('should return true for numeric types', () => {
		const numericTypes = [
			{ Type: ResourceType.Float },
			{ Type: ResourceType.Integer },
			{ Type: ResourceType.Time },
		]

		numericTypes.forEach((def) => {
			assert.strictEqual(isNumeric(def), true)
		})
	})

	void it('should return false for non-numeric types', () => {
		const nonNumericTypes = [
			{ Type: ResourceType.String },
			{ Type: ResourceType.Opaque },
			{ Type: ResourceType.Boolean },
		]

		nonNumericTypes.forEach((def) => {
			assert.strictEqual(isNumeric(def), false)
		})
	})
})
