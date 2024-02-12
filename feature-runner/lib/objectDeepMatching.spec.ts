import { describe, it } from 'node:test'
import { check, not } from 'tsmatchers'
import { objectDeepMatching } from './objectDeepMatching.js'

void describe('objectDeepMatching()', () => {
	void it('should deep match an object', () => {
		check({
			foo: 'bar',
			baz: {
				foo: 'bar',
			},
		}).is(
			objectDeepMatching({
				foo: 'bar',
				baz: {
					foo: 'bar',
				},
			}),
		)
	})

	void it('should not deep match an object with missing props', () => {
		check({
			foo: 'bar',
		}).is(
			not(
				objectDeepMatching({
					foo: 'bar',
					baz: {
						foo: 'bar',
					},
				}),
			),
		)
	})

	void it('should deep match an object with excess props', () => {
		check({
			foo: 'bar',
			baz: {
				foo: 'bar',
			},
		}).is(
			objectDeepMatching({
				foo: 'bar',
			}),
		)
	})

	void it('should deep match an object with excess props in an array', () => {
		check({
			foo: 'bar',
			baz: [
				{
					foo: 'bar',
					bar: 'baz',
				},
			],
		}).is(
			objectDeepMatching({
				foo: 'bar',
				baz: [
					{
						foo: 'bar',
					},
				],
			}),
		)
	})

	void it('should not deep match an object with missing props in an array', () => {
		check({
			baz: [
				{
					bar: 'baz',
				},
			],
		}).is(
			not(
				objectDeepMatching({
					baz: [
						{
							foo: 'bar',
						},
					],
				}),
			),
		)
	})
})
