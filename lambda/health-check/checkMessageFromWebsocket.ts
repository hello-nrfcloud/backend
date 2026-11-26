import { WebSocket, type RawData } from 'ws'
import { defer } from './defer.ts'

export const ValidateResponse = {
	skip: 0,
	valid: 1,
	invalid: 2,
} as const
export type ValidateResponse =
	(typeof ValidateResponse)[keyof typeof ValidateResponse]

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
