import {
	codeBlockOrThrow,
	noMatch,
	StepRunner,
	StepRunnerArgs,
	StepRunResult,
} from '@nordicsemiconductor/bdd-markdown'
import assert from 'assert/strict'
import WebSocket from 'ws'
import type { World } from '../run-features.js'

type ReturnDefer<T> = {
	promise: Promise<T>
	resolve: (value: T) => void
	reject: (reason: any) => void
}

function defer(): ReturnDefer<void> {
	const ret = {} as ReturnDefer<void>

	const promise = new Promise<void>((_resolve, _reject) => {
		ret.resolve = _resolve
		ret.reject = _reject
	})

	ret.promise = promise

	return ret
}

let wsClient: WebSocket
let wsOnConnectMessage: Record<string, unknown> | null

async function wsConnect({
	step,
	log: {
		step: { progress },
	},
	context: { websocketUri },
}: StepRunnerArgs<World>): Promise<StepRunResult> {
	const match =
		/^I connect to `(?<endpoint>[^`]+)` with code `(?<code>[^`]+)`$/.exec(
			step.title,
		)
	if (match === null) return noMatch

	if (wsClient !== undefined && wsClient.readyState === WebSocket.OPEN)
		wsClient.terminate()

	progress(`Connect websocket to ${websocketUri}`)
	const deferred = defer()

	wsClient = new WebSocket(`${websocketUri}?code=${match.groups?.code}`)
	const timer = setTimeout(() => {
		wsClient.emit('error', new Error('Waiting for connection message timeout'))
	}, 5 * 1000)

	wsClient
		.on('connect', () => {
			progress(`ws: connected`)
		})
		.on('error', (error) => {
			progress(`ws: error`, error.message)

			clearTimeout(timer)
			wsClient.terminate()
			deferred.reject(error)
		})
	wsClient.once('message', (message: Buffer) => {
		progress(`< `, message.toString())
		try {
			wsOnConnectMessage = JSON.parse(message.toString())
		} catch (error) {
			wsOnConnectMessage = null
		}

		clearTimeout(timer)
		wsClient.terminate()
		deferred.resolve()
	})

	await deferred.promise
}

async function wsConnectionMessage({
	step,
}: StepRunnerArgs<World>): Promise<StepRunResult> {
	const match = /^the response should equal to this JSON$/.exec(step.title)
	if (match === null) return noMatch

	assert.deepEqual(wsOnConnectMessage, JSON.parse(codeBlockOrThrow(step).code))
}

export const steps = (): StepRunner<World>[] => {
	return [wsConnect, wsConnectionMessage]
}
