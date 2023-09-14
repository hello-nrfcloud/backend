import WebSocket from 'ws'
import { ulid } from '../../util/ulid.js'

export type WebSocketClient = {
	id: string
	connect: () => Promise<any>
	close: () => void
	send: (message: Record<string, unknown>) => Promise<void>
	messages: Record<string, unknown>
}
const clients: Record<string, WebSocketClient> = {}

export const createWebsocketClient = ({
	id,
	url,
	debug,
}: {
	id: string
	url: string
	debug?: (...args: string[]) => void
}): WebSocketClient => {
	if (clients[id] === undefined) {
		const client = new WebSocket(url)
		const messages: Record<string, unknown> = {} as const
		clients[id] = {
			id,
			connect: async () =>
				new Promise<void>((resolve, reject) =>
					client
						.on('open', () => {
							resolve()
						})
						.on('error', (error) => {
							debug?.(`Connection error: ${error.message}`)
							reject(new Error(`Connection to ${url} failed.`))
						})
						.on('message', async (msg) => {
							const message = JSON.parse(msg.toString())
							debug?.('<< ' + msg.toString())
							messages[ulid()] = message
						}),
				),
			close: () => {
				client.terminate()
				delete clients[id]
			},
			messages,
			send: async (message) =>
				new Promise<void>((resolve, reject) => {
					const strMessage = JSON.stringify(message)
					client.send(strMessage, (error) => {
						if (error) return reject(error)
						debug?.('>> ' + strMessage)
						resolve()
					})
				}),
		}
	}

	return clients[id] as WebSocketClient
}
