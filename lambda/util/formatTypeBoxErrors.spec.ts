import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { formatTypeBoxErrors } from './formatTypeBoxErrors.js'
import { validateWithTypeBox } from '../../util/validateWithTypeBox.js'
import { Type } from '@sinclair/typebox'

void describe('formatTypeBoxErrors()', async () =>
	void it('should format TypeBox errors', () => {
		const validateInput = validateWithTypeBox(
			Type.Object({
				email: Type.RegExp(/.+@.+/),
			}),
		)
		assert.equal(
			formatTypeBoxErrors(
				(
					validateInput({
						email: 'f',
					}) as any
				).errors,
			),
			`/email: Expected string to match regular expression`,
		)
	}))
