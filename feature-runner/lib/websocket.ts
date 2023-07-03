import WebSocket from 'ws'
import { ulid } from '../../util/ulid.js'

export type WebSocketClient = {
	connect: () => Promise<any>
	close: () => void
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
		const messages: Record<string, unknown> = {}
		clients[id] = {
			connect: async () =>
				new Promise<void>((resolve, reject) =>
					client
						.on('open', () => {
							resolve()
						})
						.on('error', () => {
							reject(new Error(`Connection to ${url} failed.`))
						})
						.on('close', () => {
							void 0
						})
						.on('message', async (msg) => {
							const message = JSON.parse(msg.toString())
							debug?.(msg.toString())
							messages[ulid()] = message
						}),
				),
			close: () => {
				client.terminate()
				delete clients[id]
			},
			messages,
		}
	}

	return clients[id] as WebSocketClient
}
