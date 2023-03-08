import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs'
import {
	codeBlockOrThrow,
	noMatch,
	StepRunner,
	StepRunnerArgs,
	StepRunResult,
} from '@nordicsemiconductor/bdd-markdown'
import assert from 'assert/strict'
import { randomUUID } from 'crypto'
import { createWebsocketClient, WebSocketClient } from '../lib/websoket.js'
import type { World } from '../run-features.js'

const sqsClient = new SQSClient({})
let wsClient: WebSocketClient

async function wsConnect({
	step,
	log: {
		step: { progress },
	},
	context: { websocketUri },
}: StepRunnerArgs<World>): Promise<StepRunResult> {
	const match = /^I connect websocket with code `(?<code>[^`]+)`$/.exec(
		step.title,
	)
	if (match === null) return noMatch

	progress(`Connect websocket to ${websocketUri}`)
	wsClient = createWebsocketClient({
		id: randomUUID(),
		url: `${websocketUri}?code=${match.groups?.code}`,
	})

	await wsClient.connect()
}

async function wsClose({
	step,
	log: {
		step: { progress },
	},
}: StepRunnerArgs<World>): Promise<StepRunResult> {
	const match = /^I close connection$/.exec(step.title)
	if (match === null) return noMatch

	progress(`Close websocket`)
	wsClient.close()
}

async function wsConnectionMessage({
	step,
	log: {
		step: { progress },
	},
}: StepRunnerArgs<World>): Promise<StepRunResult> {
	const match = /^the connection response should equal to this JSON$/.exec(
		step.title,
	)
	if (match === null) return noMatch

	progress(`Fetching ws connection message`)
	const message = await wsClient.fetchConnectionMessage()
	progress(`Received message`, message)
	assert.deepEqual(JSON.parse(message), JSON.parse(codeBlockOrThrow(step).code))
}

async function wsMessage({
	step,
	log: {
		step: { progress },
	},
}: StepRunnerArgs<World>): Promise<StepRunResult> {
	const match = /^the response should equal to this JSON$/.exec(step.title)
	if (match === null) return noMatch

	const message: string = await wsClient.fetchMessage()
	progress(`Received ws message`, message)
	assert.deepEqual(JSON.parse(message), JSON.parse(codeBlockOrThrow(step).code))
}

async function sendToQueue({
	step,
	log: {
		step: { progress },
	},
	context: { websocketQueueUri },
}: StepRunnerArgs<World>): Promise<StepRunResult> {
	const match = /^I send message to queue with this JSON$/.exec(step.title)
	if (match === null) return noMatch

	progress(`Publish to queue ${websocketQueueUri}`)
	await sqsClient.send(
		new SendMessageCommand({
			QueueUrl: websocketQueueUri,
			MessageBody: codeBlockOrThrow(step).code,
		}),
	)
}

export const steps = (): StepRunner<World>[] => {
	return [wsConnect, wsConnectionMessage, wsMessage, sendToQueue, wsClose]
}
