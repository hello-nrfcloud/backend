import { ResourceType } from '@hello.nrfcloud.com/proto-map/lwm2m'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isNumeric } from './isNumeric.js'

void describe('isNumeric', () => {
	void it('should return true for numeric types', () => {
		const numericTypes = [
			{ Type: ResourceType.Float },
			{ Type: ResourceType.Integer },
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
			{ Type: ResourceType.Time },
		]

		nonNumericTypes.forEach((def) => {
			assert.strictEqual(isNumeric(def), false)
		})
	})
})
