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

	const found = wsClient?.messages.find((message) => {
		try {
			if (match?.groups?.equalOrMatch === 'match') {
				expect(message).to.containSubset(
					JSON.parse(codeBlockOrThrow(step).code),
				)
			} else {
				assert.deepEqual(message, JSON.parse(codeBlockOrThrow(step).code))
			}
			return true
		} catch {
			debug('no match', JSON.stringify(message))
			return false
		}
	})
	expect(found).not.to.equal(undefined)
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
