import {
	codeBlockOrThrow,
	noMatch,
	type StepRunner,
	type StepRunnerArgs,
	type StepRunResult,
} from '@nordicsemiconductor/bdd-markdown'
import assert from 'assert/strict'
import * as chai from 'chai'
import { expect } from 'chai'
import chaiSubset from 'chai-subset'
import { randomUUID } from 'crypto'
import {
	createWebsocketClient,
	type WebSocketClient,
} from '../lib/websocket.js'
import type { World } from '../run-features.js'

chai.use(chaiSubset)

const wsClients: Record<string, WebSocketClient> = {}

const getContextFromMessageType = (messageType: string): string => {
	switch (messageType) {
		case 'gain':
			return 'https://github.com/hello-nrfcloud/proto/transformed/PCA20035%2Bsolar/gain'
		case 'historical':
			return 'https://github.com/hello-nrfcloud/proto/transformed/PCA20035%2Bsolar/historical-data'
		case 'shadow':
			return 'https://github.com/hello-nrfcloud/proto/transformed/PCA20035%2Bsolar/reported'
		default:
			throw Error(`Cannot find context from the given message type`)
	}
}

const wsConnect = async ({
	step,
	log: {
		step: { progress },
		feature: { progress: featureProgress },
	},
	context,
}: StepRunnerArgs<World>): Promise<StepRunResult> => {
	const match =
		/^I connect websocket with fingerprint `(?<fingerprint>[^`]+)`$/.exec(
			step.title,
		)
	if (match === null) return noMatch

	const { websocketUri } = context
	const wsURL = `${websocketUri}?fingerprint=${match.groups?.fingerprint}`

	if (wsClients[wsURL] === undefined) {
		progress(`Connect websocket to ${websocketUri}`)
		wsClients[wsURL] = createWebsocketClient({
			id: match.groups?.fingerprint ?? randomUUID(),
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
	const match =
		/^the (?<messageType>[^\s]+) response should (?<equalOrMatch>equal|match)(?: to)? this JSON$/.exec(
			step.title,
		)
	if (match === null) return noMatch

	const context = getContextFromMessageType(match.groups?.messageType ?? '')
	const expectedResult = JSON.parse(codeBlockOrThrow(step).code)
	const message: Record<string, unknown> = await wsClient?.fetchMessage(context)
	progress(`Received ws message`, JSON.stringify(message, null, 2))

	if (match?.groups?.equalOrMatch === 'match') {
		expect(message).to.containSubset(expectedResult)
	} else {
		assert.deepEqual(message, expectedResult)
	}
}

const wsMessageTimeout = async ({
	step,
	log: {
		step: { progress },
	},
	context: { wsClient },
}: StepRunnerArgs<World>): Promise<StepRunResult> => {
	const match =
		/^the (?<messageType>[^\s]+) response should equal to empty string$/.exec(
			step.title,
		)
	if (match === null) return noMatch

	const context = getContextFromMessageType(match.groups?.messageType ?? '')
	const message: string = await wsClient?.fetchMessage(context)
	progress(`Received ws message`)
	assert.deepEqual(message, '')
}

const wsSend = async ({
	step,
	log: {
		step: { progress },
	},
	context: { wsClient },
}: StepRunnerArgs<World>): Promise<StepRunResult> => {
	const match = /^I send websocket request as this JSON$/.exec(step.title)
	if (match === null) return noMatch

	const payload = JSON.parse(codeBlockOrThrow(step).code)
	await wsClient?.send(payload)
	progress(`Sent ws message`, JSON.stringify(payload, null, 2))
}

export const websocketStepRunners = (): {
	steps: StepRunner<World>[]
	cleanup: () => Promise<void>
} => ({
	steps: [wsConnect, wsConnectionMessage, wsMessage, wsMessageTimeout, wsSend],
	cleanup: async (): Promise<void> => {
		await Promise.all(Object.values(wsClients).map((client) => client.close()))
	},
})
