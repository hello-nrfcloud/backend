import { describe, it, mock } from 'node:test'
import assert from 'node:assert/strict'
import { Type } from '@sinclair/typebox'
import { JSONPayload, validatedFetch } from './validatedFetch.js'

void describe('validatedFetch()', () => {
	void it('should call an nRF Cloud API endpoint and validate the response', async () => {
		const mockFetch = mock.fn(() => ({
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

		assert.equal('error' in res, false)
		assert.equal('result' in res, true)
		assert.deepEqual('result' in res && res.result, { foo: 'bar' })
		assert.deepEqual(mockFetch.mock.calls[0]?.arguments, [
			`https://example.com/v1/foo`,
			{
				headers: {
					Accept: 'application/json; charset=utf-8',
					Authorization: 'Bearer some-key',
				},
			},
		])
	})

	void it('should return the fetch exception', async () => {
		const err = new Error(`Some error`)
		const vf = validatedFetch(
			{
				endpoint: new URL('https://example.com/'),
				apiKey: 'some-key',
			},
			() => Promise.reject(err) as any,
		)
		assert.deepEqual(await vf({ resource: 'some-resource' }, Type.Object({})), {
			error: err,
		})
	})

	void it('should send POST request if body is given', async () => {
		const mockFetch = mock.fn(() => ({
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

		assert.deepEqual(mockFetch.mock.calls[0]?.arguments, [
			`https://example.com/v1/foo`,
			{
				method: 'POST',
				body: 'some data',
				headers: {
					Accept: 'application/json; charset=utf-8',
					Authorization: 'Bearer some-key',
					'Content-Type': 'application/octet-stream',
				},
			},
		])
	})

	void it('should allow to specify the method', async () => {
		const mockFetch = mock.fn(() => ({
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

		assert.deepEqual(mockFetch.mock.calls[0]?.arguments, [
			`https://example.com/v1/foo`,
			{
				method: 'POST',
				headers: {
					Accept: 'application/json; charset=utf-8',
					Authorization: 'Bearer some-key',
				},
			},
		])
	})
})

void describe('JSONPayload()', () => {
	void it('should convert a an object to a payload definition to be used in validatedFetch', () =>
		assert.deepEqual(JSONPayload({ foo: 'bar' }), {
			type: 'application/json',
			body: JSON.stringify({ foo: 'bar' }),
		}))
})
