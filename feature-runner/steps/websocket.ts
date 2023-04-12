import {
	codeBlockOrThrow,
	noMatch,
	type StepRunner,
	type StepRunnerArgs,
	type StepRunResult,
} from '@nordicsemiconductor/bdd-markdown'
import assert from 'assert/strict'
import { randomUUID } from 'crypto'
import {
	createWebsocketClient,
	type WebSocketClient,
} from '../lib/websocket.js'
import type { World } from '../run-features.js'

const wsClients: Record<string, WebSocketClient> = {}

const wsConnect = async ({
	step,
	log: {
		step: { progress },
		feature: { progress: featureProgress },
	},
	context,
}: StepRunnerArgs<World>): Promise<StepRunResult> => {
	const match = /^I connect websocket with code `(?<code>[^`]+)`$/.exec(
		step.title,
	)
	if (match === null) return noMatch

	const { websocketUri } = context
	const wsURL = `${websocketUri}?code=${match.groups?.code}`

	if (wsClients[wsURL] === undefined) {
		progress(`Connect websocket to ${websocketUri}`)
		wsClients[wsURL] = createWebsocketClient({
			id: match.groups?.code ?? randomUUID(),
			url: wsURL,
			debug: (...args) => featureProgress('[ws]', ...args),
		})
		await wsClients[wsURL]?.connect()
	}

	context.wsClient = wsClients[wsURL] as WebSocketClient
}

const wsConnectionMessage = async ({
	step,
	log: {
		step: { progress },
	},
	context: { wsClient },
}: StepRunnerArgs<World>): Promise<StepRunResult> => {
	const match = /^the connection response should equal to this JSON$/.exec(
		step.title,
	)
	if (match === null) return noMatch

	progress(`Fetching ws connection message`)
	const message = await wsClient?.fetchConnectionMessage()
	progress(`Received message`, JSON.stringify(message, null, 2))
	assert.deepEqual(message, JSON.parse(codeBlockOrThrow(step).code))
}

const wsMessage = async ({
	step,
	log: {
		step: { progress },
	},
	context: { wsClient },
}: StepRunnerArgs<World>): Promise<StepRunResult> => {
	const match = /^the response should equal to this JSON$/.exec(step.title)
	if (match === null) return noMatch

	const message: string = await wsClient?.fetchMessage()
	progress(`Received ws message`, JSON.stringify(message, null, 2))
	assert.deepEqual(message, JSON.parse(codeBlockOrThrow(step).code))
}

const wsMessageTimeout = async ({
	step,
	log: {
		step: { progress },
	},
	context: { wsClient },
}: StepRunnerArgs<World>): Promise<StepRunResult> => {
	const match = /^the response should equal to empty string$/.exec(step.title)
	if (match === null) return noMatch

	const message: string = await wsClient?.fetchMessage()
	progress(`Received ws message`)
	assert.deepEqual(message, '')
}

export const websocketStepRunners = (): {
	steps: StepRunner<World>[]
	cleanup: () => Promise<void>
} => ({
	steps: [wsConnect, wsConnectionMessage, wsMessage, wsMessageTimeout],
	cleanup: async (): Promise<void> => {
		await Promise.all(Object.values(wsClients).map((client) => client.close()))
	},
})
