import WebSocket from 'ws'
import { ulid } from '../../util/ulid.js'

export type WebSocketClient = {
	id: string
	connect: () => Promise<any>
	close: () => void
	send: (message: Record<string, unknown>) => Promise<void>
	messages: Record<string, unknown>
}

export const createWebsocketClient = ({
	id,
	url,
	debug,
}: {
	id: string
	url: string
	debug?: (...args: string[]) => void
}): WebSocketClient => {
	const client = new WebSocket(url)
	const messages: Record<string, unknown> = {} as const

	const wsClient: WebSocketClient = {
		id,
		connect: async () =>
			new Promise<void>((resolve, reject) =>
				client
					.on('open', () => {
						debug?.(`Connected.`)
						resolve()
					})
					.on('error', (error) => {
						debug?.(`Connection error: ${error.message}`)
						reject(new Error(`Connection to ${url} failed.`))
					})
					.on('message', async (msg) => {
						const message = JSON.parse(msg.toString())
						debug?.(`<< ` + msg.toString())
						messages[ulid()] = message
					}),
			),
		close: () => {
			debug?.(`Closing connection`)
			client.terminate()
		},
		messages,
		send: async (message) =>
			new Promise<void>((resolve, reject) => {
				const strMessage = JSON.stringify(message)
				client.send(strMessage, (error) => {
					if (error) return reject(error)
					debug?.(`>> ` + strMessage)
					resolve()
				})
			}),
	}

	return wsClient
}
