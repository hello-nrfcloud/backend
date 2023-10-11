import { Type } from '@sinclair/typebox'
import { validatedFetch } from './validatedFetch.js'

describe('validatedFetch()', () => {
	it('should call an nRF Cloud API endpoint and validate the response', async () => {
		const mockFetch = jest.fn(() => ({
			ok: true,
			json: async () =>
				Promise.resolve({
					foo: 'bar',
				}),
		}))
		const vf = validatedFetch(
			{
				endpoint: new URL('https://example.com/'),
				apiKey: 'some-key',
			},
			mockFetch as any,
		)

		const schema = Type.Object({ foo: Type.Literal('bar') })

		const res = await vf({ resource: 'foo' }, schema)

		expect(res).not.toHaveProperty('error')
		expect(res).toHaveProperty('result')
		expect('result' in res && res.result).toMatchObject({ foo: 'bar' })
		expect(mockFetch).toHaveBeenCalledWith(`https://example.com/v1/foo`, {
			headers: {
				Accept: 'application/json; charset=utf-8',
				Authorization: 'Bearer some-key',
				'Content-Type': 'application/json',
			},
		})
	})

	it('should return the fetch exception', async () => {
		const err = new Error(`Some error`)
		const mockFetch = jest.fn(() => {
			throw err
		})
		const vf = validatedFetch(
			{
				endpoint: new URL('https://example.com/'),
				apiKey: 'some-key',
			},
			mockFetch as any,
		)
		expect(
			await vf({ resource: 'some-resource' }, mockFetch as any),
		).toMatchObject({ error: err })
	})

	it('should override the defaults if init parameter is provided', async () => {
		const mockFetch = jest.fn(() => ({
			ok: true,
			json: async () =>
				Promise.resolve({
					foo: 'bar',
				}),
		}))
		const vf = validatedFetch(
			{
				endpoint: new URL('https://example.com/'),
				apiKey: 'some-key',
			},
			mockFetch as any,
		)
		const schema = Type.Object({ foo: Type.Literal('bar') })

		const res = await vf({ resource: 'foo' }, schema, {
			method: 'POST',
			headers: {
				Authorization: 'Bearer another-key',
				'Content-Type': 'application/octet-stream',
			},
		})

		expect(res).not.toHaveProperty('error')
		expect(res).toHaveProperty('result')
		expect('result' in res && res.result).toMatchObject({ foo: 'bar' })
		expect(mockFetch).toHaveBeenCalledWith(`https://example.com/v1/foo`, {
			method: 'POST',
			headers: {
				Authorization: 'Bearer another-key',
				'Content-Type': 'application/octet-stream',
			},
		})
	})
})
