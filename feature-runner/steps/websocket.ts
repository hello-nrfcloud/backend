import {
	codeBlockOrThrow,
	regExpMatchedStep,
	type StepRunner,
} from '@nordicsemiconductor/bdd-markdown'
import { Type } from '@sinclair/typebox'
import assert from 'assert/strict'
import {
	createWebsocketClient,
	type WebSocketClient,
} from '../lib/websocket.js'
import pRetry from 'p-retry'
import { setTimeout } from 'timers/promises'
import { check } from 'tsmatchers'
import { objectDeepMatching } from '../lib/objectDeepMatching.js'

const wsClients: Record<string, WebSocketClient> = {}
const wsConnect = ({ websocketUri }: { websocketUri: string }) =>
	regExpMatchedStep(
		{
			regExp:
				/^I (?<reconnect>re)?connect to the websocket using fingerprint `(?<fingerprint>[^`]+)`$/,
			schema: Type.Object({
				reconnect: Type.Optional(Type.Literal('re')),
				fingerprint: Type.String(),
			}),
		},
		async ({
			match: { reconnect, fingerprint },
			log: { progress },
			context,
		}) => {
			const wsURL = `${websocketUri}?fingerprint=${fingerprint}`

			if (reconnect !== undefined && wsClients[wsURL] !== undefined) {
				wsClients[wsURL]?.close()
				delete wsClients[wsURL]
				await setTimeout(2000)
			}

			if (wsClients[wsURL] === undefined) {
				progress(`Connect websocket to ${websocketUri}`)
				wsClients[wsURL] = createWebsocketClient({
					id: fingerprint,
					url: wsURL,
					debug: (...args) => progress('[ws]', ...args),
				})
				await pRetry(
					async (attempt: number) => {
						progress(`(Attempt: ${attempt}) Connecting websocket`)
						await wsClients[wsURL]?.connect()
					},
					{
						retries: 5,
						minTimeout: 500,
						maxTimeout: 1000,
					},
				)
			}

			context.wsClient = wsClients[wsURL] as WebSocketClient
		},
	)

const receive = regExpMatchedStep(
	{
		regExp:
			/^I should receive a message on the websocket that (?<equalOrMatch>is equal to|matches)$/,
		schema: Type.Object({
			equalOrMatch: Type.Union([
				Type.Literal('is equal to'),
				Type.Literal('matches'),
			]),
		}),
	},
	async ({ match: { equalOrMatch }, log: { debug }, step, context }) => {
		const { wsClient } = context
		const expected = JSON.parse(codeBlockOrThrow(step).code)

		const findMessages = async (attempt: number) => {
			const found = Object.entries(wsClient?.messages ?? {}).find(
				([id, message]) => {
					debug(
						`(Attempt: ${attempt - 1}) [${wsClient?.id}] Checking if message`,
						JSON.stringify(message),
						equalOrMatch,
						JSON.stringify(expected),
					)
					try {
						if (equalOrMatch === 'matches') {
							check(message).is(objectDeepMatching(expected))
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

		await pRetry(findMessages, {
			retries: 5,
			minTimeout: 1000,
			maxTimeout: 5000,
		})
	},
)

const wsSend = <StepRunner>{
	match: (title: string) =>
		/^I send this message via the websocket$/.test(title),
	run: async ({ log: { progress }, context, step }) => {
		const { wsClient } = context
		const message = JSON.parse(codeBlockOrThrow(step).code)
		await setTimeout(1000)
		await wsClient?.send(message)
		progress(`Sent ws message`, JSON.stringify(message, null, 2))
	},
}

export const websocketStepRunners = ({
	websocketUri,
}: {
	websocketUri: string
}): {
	steps: StepRunner<{
		wsClient?: WebSocketClient
	}>[]
	cleanup: () => Promise<void>
} => ({
	steps: [wsConnect({ websocketUri }), receive, wsSend],
	cleanup: async (): Promise<void> => {
		await Promise.all(Object.values(wsClients).map((client) => client.close()))
	},
})
