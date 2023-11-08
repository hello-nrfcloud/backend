import {
	ValidateResponse,
	checkMessageFromWebsocket,
} from './checkMessageFromWebsocket.js'
import { WebSocketServer, type AddressInfo } from 'ws'
import * as net from 'node:net'
import { setTimeout } from 'node:timers/promises'
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

describe('checkMessageFromWebsocket', () => {
	beforeAll(async () => {
		port = await getRandomPort()
		fakeServer = new WebSocketServer({ port })
	})

	beforeEach(() => {
		jest.clearAllMocks()
	})

	afterAll(() => {
		fakeServer.close()
	})

	it('should resolve with true on successful validation', async () => {
		const validate = jest.fn().mockResolvedValue(ValidateResponse.valid)
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

		expect(result).toBe(true)
		expect(validate).toHaveBeenCalled()
	})

	it('should reject with false on invalid message', async () => {
		const validate = jest.fn().mockResolvedValue(ValidateResponse.invalid)

		await expect(
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
		).rejects.toBeFalsy()
		expect(validate).toHaveBeenCalled()
	})

	it('should reject with DeferTimeoutError on timeout', async () => {
		const validate = jest.fn().mockResolvedValue(ValidateResponse.invalid)

		await expect(
			checkMessageFromWebsocket({
				endpoint: `ws://localhost:${port}`,
				timeoutMS: 500,
				onConnect: async () => {
					await setTimeout(600)
					fakeServer.clients.forEach((client) => {
						client.send('hello')
					})
				},
				validate,
			}),
		).rejects.toBeInstanceOf(DeferTimeoutError)
	})

	it('should reject on WebSocket error', async () => {
		const validate = jest.fn().mockResolvedValue(ValidateResponse.invalid)

		await expect(
			checkMessageFromWebsocket({
				endpoint: `ws://localhost:${port + 1}`,
				timeoutMS: 500,
				onConnect: async () => {
					await setTimeout(600)
					fakeServer.clients.forEach((client) => {
						client.send('hello')
					})
				},
				validate,
			}),
		).rejects.toThrow()
		expect(validate).not.toHaveBeenCalled()
	})
})
