import { Type } from '@sinclair/typebox'
import { JSONPayload, validatedFetch } from './validatedFetch.js'

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

	it('should send POST request if body is given', async () => {
		const mockFetch = jest.fn(() => ({
			ok: true,
			json: async () => Promise.resolve({}),
		}))
		const vf = validatedFetch(
			{
				endpoint: new URL('https://example.com/'),
				apiKey: 'some-key',
			},
			mockFetch as any,
		)

		await vf(
			{
				resource: 'foo',
				payload: {
					type: 'application/octet-stream',
					body: 'some data',
				},
			},
			Type.Object({}),
		)

		expect(mockFetch).toHaveBeenCalledWith(
			`https://example.com/v1/foo`,
			expect.objectContaining({
				method: 'POST',
				body: 'some data',
				headers: {
					Accept: 'application/json; charset=utf-8',
					Authorization: 'Bearer some-key',
					'Content-Type': 'application/octet-stream',
				},
			}),
		)
	})

	it('should allow to specify the method', async () => {
		const mockFetch = jest.fn(() => ({
			ok: true,
			json: async () => Promise.resolve({}),
		}))
		const vf = validatedFetch(
			{
				endpoint: new URL('https://example.com/'),
				apiKey: 'some-key',
			},
			mockFetch as any,
		)

		await vf(
			{
				resource: 'foo',
				method: 'POST',
			},
			Type.Object({}),
		)

		expect(mockFetch).toHaveBeenCalledWith(
			`https://example.com/v1/foo`,
			expect.objectContaining({
				method: 'POST',
				headers: {
					Accept: 'application/json; charset=utf-8',
					Authorization: 'Bearer some-key',
				},
			}),
		)
	})
})

describe('JSONPayload()', () => {
	it('should convert a an object to a payload definition to be used in validatedFecth', () =>
		expect(JSONPayload({ foo: 'bar' })).toEqual({
			type: 'application/json',
			body: JSON.stringify({ foo: 'bar' }),
		}))
})
