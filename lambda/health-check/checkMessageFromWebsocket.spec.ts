import assert from 'node:assert/strict'
import * as net from 'node:net'
import { after, before, describe, it, mock } from 'node:test'
import { setTimeout } from 'node:timers/promises'
import { WebSocketServer, type AddressInfo } from 'ws'
import {
	ValidateResponse,
	checkMessageFromWebsocket,
} from './checkMessageFromWebsocket.js'
import { DeferTimeoutError } from './defer.js'

const getRandomPort = async (): Promise<number> => {
	const server = net.createServer()
	return new Promise((resolve) => {
		server.listen(0, () => {
			const port = (server.address() as AddressInfo).port
			server.close(() => {
				resolve(port)
			})
		})
	})
}

let port: number
let fakeServer: WebSocketServer

void describe('checkMessageFromWebsocket', () => {
	before(async () => {
		port = await getRandomPort()
		fakeServer = new WebSocketServer({ port })
	})

	after(() => {
		fakeServer.close()
	})

	void it('should resolve with true on successful validation', async () => {
		const validate = mock.fn(async () =>
			Promise.resolve(ValidateResponse.valid),
		)
		const result = await checkMessageFromWebsocket({
			endpoint: `ws://localhost:${port}`,
			timeoutMS: 1000,
			onConnect: async () => {
				fakeServer.clients.forEach((client) => {
					client.send('hello')
				})
			},
			validate,
		})

		assert.equal(result, true)
		assert.equal(validate.mock.callCount(), 1)
	})

	void it('should reject with false on invalid message', async () => {
		const validate = mock.fn(async () =>
			Promise.resolve(ValidateResponse.invalid),
		)
		void assert.rejects(async () =>
			checkMessageFromWebsocket({
				endpoint: `ws://localhost:${port}`,
				timeoutMS: 1000,
				onConnect: async () => {
					fakeServer.clients.forEach((client) => {
						client.send('hello')
					})
				},
				validate,
			}),
		)
		assert.equal(validate.mock.callCount(), 0)
	})

	void it('should reject with DeferTimeoutError on timeout', async () =>
		assert.rejects(
			async () =>
				checkMessageFromWebsocket({
					endpoint: `ws://localhost:${port}`,
					timeoutMS: 500,
					onConnect: async () => {
						await setTimeout(600)
						fakeServer.clients.forEach((client) => {
							client.send('hello')
						})
					},
					validate: async () => Promise.resolve(ValidateResponse.invalid),
				}),
			DeferTimeoutError,
		))

	void it('should reject on WebSocket error', async () =>
		assert.rejects(async () =>
			checkMessageFromWebsocket({
				endpoint: `ws://localhost:${port + 1}`,
				timeoutMS: 500,
				onConnect: async () => {
					await setTimeout(600)
					fakeServer.clients.forEach((client) => {
						client.send('hello')
					})
				},
				validate: async () => Promise.reject(new Error()),
			}),
		))
})
