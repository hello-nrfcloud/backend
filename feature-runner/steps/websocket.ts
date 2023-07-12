import {
	codeBlockOrThrow,
	matchGroups,
	noMatch,
	type StepRunner,
	type StepRunnerArgs,
	type StepRunResult,
} from '@nordicsemiconductor/bdd-markdown'
import { Type } from '@sinclair/typebox'
import assert from 'assert/strict'
import * as chai from 'chai'
import { expect } from 'chai'
import chaiSubset from 'chai-subset'
import {
	createWebsocketClient,
	type WebSocketClient,
} from '../lib/websocket.js'
import type { World } from '../run-features.js'

chai.use(chaiSubset)

const wsClients: Record<string, WebSocketClient> = {}
const wsConnect = async ({
	step,
	log: {
		step: { progress },
		feature: { progress: featureProgress },
	},
	context,
}: StepRunnerArgs<World>): Promise<StepRunResult> => {
	const match = matchGroups(
		Type.Object({
			reconnect: Type.Optional(Type.Literal('re')),
			fingerprint: Type.String(),
		}),
	)(
		/^I (?<reconnect>re)?connect to the websocket using fingerprint `(?<fingerprint>[^`]+)`$/,
		step.title,
	)
	if (match === null) return noMatch

	const { websocketUri } = context
	const wsURL = `${websocketUri}?fingerprint=${match.fingerprint}`

	if (match.reconnect !== undefined && wsClients[wsURL] === undefined) {
		wsClients[wsURL]?.close()
		delete wsClients[wsURL]
	}

	if (wsClients[wsURL] === undefined) {
		progress(`Connect websocket to ${websocketUri}`)
		wsClients[wsURL] = createWebsocketClient({
			id: match.fingerprint,
			url: wsURL,
			debug: (...args) => featureProgress('[ws]', ...args),
		})
		await wsClients[wsURL]?.connect()
	}

	context.wsClient = wsClients[wsURL] as WebSocketClient
}

const receive = async ({
	step,
	log: {
		step: { debug },
	},
	context,
}: StepRunnerArgs<World>): Promise<StepRunResult> => {
	const match = matchGroups(
		Type.Object({
			equalOrMatch: Type.Union([
				Type.Literal('is equal to'),
				Type.Literal('matches'),
			]),
		}),
	)(
		/^I should receive a message on the websocket that (?<equalOrMatch>is equal to|matches)$/,
		step.title,
	)
	if (match === null) return noMatch
	const { equalOrMatch } = match

	const { wsClient } = context
	const expected = JSON.parse(codeBlockOrThrow(step).code)
	const found = Object.entries(wsClient?.messages ?? {}).find(
		([id, message]) => {
			debug(
				`Checking if message`,
				JSON.stringify(message),
				equalOrMatch,
				JSON.stringify(expected),
			)
			try {
				if (equalOrMatch === 'matches') {
					expect(message).to.containSubset(expected)
				} else {
					assert.deepEqual(message, expected)
				}
				debug('match', JSON.stringify(message))
				delete wsClient?.messages[id]
				return true
			} catch {
				debug('no match', JSON.stringify(message))
				return false
			}
		},
	)
	if (found === undefined)
		throw new Error(`No message found for ${JSON.stringify(expected)}`)
}

const wsSend = async ({
	step,
	log: {
		step: { progress },
	},
	context,
}: StepRunnerArgs<World>): Promise<StepRunResult> => {
	const match = /^I send websocket request$/.exec(step.title)
	if (match === null) return noMatch

	const { wsClient } = context
	const message = JSON.parse(codeBlockOrThrow(step).code)
	await wsClient?.send(message)
	progress(`Sent ws message`, JSON.stringify(message, null, 2))
}

export const websocketStepRunners = (): {
	steps: StepRunner<World>[]
	cleanup: () => Promise<void>
} => ({
	steps: [wsConnect, receive, wsSend],
	cleanup: async (): Promise<void> => {
		await Promise.all(Object.values(wsClients).map((client) => client.close()))
	},
})
