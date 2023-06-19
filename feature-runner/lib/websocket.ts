import { Context } from '@hello.nrfcloud.com/proto/hello'
import WebSocket from 'ws'

export type WebSocketClient = {
	connect: () => Promise<any>
	fetchConnectionMessage: () => Promise<any>
	fetchMessage: () => Promise<any>
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
		const messages: Record<string, unknown>[] = []
		client
			.on('open', () => {
				messages.length = 0
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
				if (message['@context'] === Context.deviceIdentity.toString()) {
					onConnectMessageDeferred.resolve(message)
				} else {
					messages.push(message)
				}
			})

		const wsClient: WebSocketClient = {
			connect: async () => {
				return onConnectDeferred.promise
			},
			fetchConnectionMessage: async () => {
				return onConnectMessageDeferred.promise
			},
			fetchMessage: async () => {
				const deferred = defer()
				let fetchTimer: NodeJS.Timeout
				const _fetch = () => {
					const message = messages.shift()
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
			close: () => {
				client.terminate()
				delete clients[id]
			},
		}

		clients[id] = wsClient
	}

	return clients[id] as WebSocketClient
}
