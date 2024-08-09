import { WebSocket, type RawData } from 'ws'
import { defer } from './defer.js'

export enum ValidateResponse {
	skip,
	valid,
	invalid,
}

export const checkMessageFromWebsocket = async ({
	endpoint,
	timeoutMS,
	onConnect,
	validate,
	log,
}: {
	endpoint: string
	timeoutMS: number
	onConnect: () => Promise<void>
	validate: (message: string) => Promise<ValidateResponse>
	log?: (...args: any[]) => void
}): Promise<boolean> => {
	const { promise, resolve, reject } = defer<boolean>(timeoutMS)
	const client = new WebSocket(endpoint)
	client
		.on('open', async () => {
			await onConnect()
		})
		.on('close', () => {
			log?.(`ws is closed`)
		})
		.on('error', reject)
		.on('message', async (data: RawData) => {
			const result = await validate(data.toString())
			if (result !== ValidateResponse.skip) {
				client.terminate()
				if (result === ValidateResponse.valid) {
					resolve(true)
				} else {
					reject(false)
				}
			}
		})

	return promise
}
