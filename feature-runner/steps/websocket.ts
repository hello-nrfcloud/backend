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
	const match =
		/^I (?<reconnect>re)?connect to the websocket using fingerprint `(?<fingerprint>[^`]+)`$/.exec(
			step.title,
		)
	if (match === null) return noMatch

	const { fingerprint, reconnect } = match.groups as {
		fingerprint: string
		reconnect?: string
	}

	const { websocketUri } = context
	const wsURL = `${websocketUri}?fingerprint=${fingerprint}`

	if (reconnect !== undefined && wsClients[wsURL] === undefined) {
		wsClients[wsURL]?.close()
		delete wsClients[wsURL]
	}

	if (wsClients[wsURL] === undefined) {
		progress(`Connect websocket to ${websocketUri}`)
		wsClients[wsURL] = createWebsocketClient({
			id: fingerprint,
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
	context: { wsClient },
}: StepRunnerArgs<World>): Promise<StepRunResult> => {
	const match =
		/^I should receive a message on the websocket that (?<equalOrMatch>is equal to|matches)$/.exec(
			step.title,
		)
	if (match === null) return noMatch
	const { equalOrMatch } = match.groups as {
		equalOrMatch: 'is equal to' | 'matches'
	}

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

export const websocketStepRunners = (): {
	steps: StepRunner<World>[]
	cleanup: () => Promise<void>
} => ({
	steps: [wsConnect, receive],
	cleanup: async (): Promise<void> => {
		await Promise.all(Object.values(wsClients).map((client) => client.close()))
	},
})
