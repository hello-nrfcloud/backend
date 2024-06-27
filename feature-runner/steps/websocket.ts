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
import jsonata from 'jsonata'

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
				const conn = await pRetry(
					async (attempt: number) => {
						progress(`(Attempt: ${attempt}) websocket to ${websocketUri}`)
						const conn = createWebsocketClient({
							id: fingerprint,
							url: wsURL,
							debug: (...args) => progress(args.join(' ')),
						})
						await conn.connect()
						return conn
					},
					{
						retries: 5,
						minTimeout: 500,
						maxTimeout: 1000,
					},
				)
				wsClients[wsURL] = conn
			}

			context.wsClient = wsClients[wsURL]
		},
	)

const matchedMessages: Array<unknown> = []

const receive = regExpMatchedStep(
	{
		regExp:
			/^I should receive a message on the websocket that (?<equalOrMatch>is equal to|matches)(?: after (?<retries>[0-9]+) retries?)?$/,
		schema: Type.Object({
			equalOrMatch: Type.Union([
				Type.Literal('is equal to'),
				Type.Literal('matches'),
			]),
			retries: Type.Optional(Type.String({ minLength: 1 })),
		}),
	},
	async ({
		match: { equalOrMatch, retries },
		log: { debug },
		step,
		context,
	}) => {
		const { wsClient } = context as { wsClient: WebSocketClient }
		const expected = JSON.parse(codeBlockOrThrow(step).code)

		const messagesSeen: Array<string> = []

		const findMessages = async (attempt: number) => {
			debug(`[${wsClient?.id}] Attempt: ${attempt - 1}`)
			const found = Object.entries(wsClient?.messages ?? {}).find(
				([id, message]) => {
					const msgString = JSON.stringify(message)
					if (messagesSeen.includes(id)) return false
					messagesSeen.push(id)
					try {
						if (equalOrMatch === 'matches') {
							check(message).is(objectDeepMatching(expected))
						} else {
							assert.deepEqual(message, expected)
						}
						debug(`match (${equalOrMatch}) ${msgString}`)
						delete wsClient?.messages[id]
						matchedMessages.push(message)
						return true
					} catch {
						debug(`no match (${equalOrMatch}) ${msgString}`)
						return false
					}
				},
			)
			if (found === undefined)
				throw new Error(`No message found for ${JSON.stringify(expected)}`)
		}

		await pRetry(findMessages, {
			retries: parseInt(retries ?? '5', 10),
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

const assertOnLastMessage = regExpMatchedStep(
	{
		regExp:
			/^`(?<exp>[^`]+)` of the last (?<matched>matched )?websocket message equals$/,
		schema: Type.Object({
			exp: Type.String({ minLength: 1 }),
			matched: Type.Optional(Type.Any()),
		}),
	},
	async ({ match: { exp, matched }, log: { debug }, step, context }) => {
		const { wsClient } = context as { wsClient: WebSocketClient }
		const expected = JSON.parse(codeBlockOrThrow(step).code)
		const e = jsonata(exp)
		const message =
			matched !== undefined
				? matchedMessages[matchedMessages.length - 1]
				: wsClient?.lastMessage()
		const result = await e.evaluate(message)
		debug(JSON.stringify(message), result)
		assert.equal(result, expected)
	},
)

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
	steps: [wsConnect({ websocketUri }), receive, wsSend, assertOnLastMessage],
	cleanup: async (): Promise<void> => {
		await Promise.all(Object.values(wsClients).map((client) => client.close()))
	},
})
