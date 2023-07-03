import { Context } from '@hello.nrfcloud.com/proto/hello'
import WebSocket from 'ws'

export type WebSocketClient = {
	connect: () => Promise<any>
	fetchConnectionMessage: () => Promise<any>
	fetchMessage: (context: string) => Promise<any>
	send: (payload: Record<string, unknown>) => Promise<void>
	close: () => void
}
const clients: Record<string, WebSocketClient> = {}

type ReturnDefer<T> = {
	promise: Promise<T>
	resolve: (value: T) => void
	reject: (reason: any) => void
}

class TimeoutError extends Error {
	constructor(message = 'Timeout') {
		super(message)
		Object.setPrototypeOf(this, TimeoutError.prototype)
	}
}

const defer = (): ReturnDefer<any> => {
	const ret = {} as ReturnDefer<any>
	const timer = setTimeout(() => {
		ret.reject(new TimeoutError())
	}, 10000)

	const promise = new Promise<any>((_resolve, _reject) => {
		ret.resolve = (v) => {
			clearTimeout(timer)
			_resolve(v)
		}
		ret.reject = (reason) => {
			clearTimeout(timer)
			_reject(reason)
		}
	})

	ret.promise = promise

	return ret
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
	if (clients[id] === undefined) {
		const client = new WebSocket(url)
		const onConnectDeferred = defer()
		const onConnectMessageDeferred = defer()
		const messages: Map<string, Record<string, unknown>[]> = new Map()
		client
			.on('open', () => {
				messages.clear()
				onConnectDeferred.resolve(void 0)
			})
			.on('error', (error) => {
				onConnectDeferred.reject(error)
			})
			.on('close', () => {
				void 0
			})
			.on('message', async (msg) => {
				const message = JSON.parse(msg.toString())
				debug?.(msg.toString())
				if ('@context' in message) {
					const context = message['@context']
					if (context === Context.deviceIdentity.toString())
						onConnectMessageDeferred.resolve(message)

					if (messages.has(context)) {
						messages.get(context)?.push(message)
					} else {
						messages.set(context, [message])
					}
				}
			})

		const wsClient: WebSocketClient = {
			connect: async () => {
				return onConnectDeferred.promise
			},
			fetchConnectionMessage: async () => {
				return onConnectMessageDeferred.promise
			},
			fetchMessage: async (context) => {
				const deferred = defer()
				let fetchTimer: NodeJS.Timeout
				const _fetch = () => {
					const message = messages.get(context)?.shift()
					if (message === undefined) {
						fetchTimer = setTimeout(_fetch, 500)
					} else {
						deferred.resolve(message)
					}
				}

				_fetch()
				return deferred.promise.catch((error) => {
					clearTimeout(fetchTimer)
					if (error instanceof TimeoutError) {
						return ''
					} else {
						throw error
					}
				})
			},
			send: async (payload) => {
				await onConnectDeferred.promise
				await new Promise((resolve, reject) => {
					client.send(
						JSON.stringify({ payload, message: 'message' }),
						(error) => {
							if (error) return reject(error)
							return resolve(void 0)
						},
					)
				})
			},
			close: () => {
				client.terminate()
				delete clients[id]
			},
		}

		clients[id] = wsClient
	}

	return clients[id] as WebSocketClient
}
