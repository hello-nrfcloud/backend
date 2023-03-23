import {
	DynamoDBClient,
	GetItemCommand,
	PutItemCommand,
} from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import {
	codeBlockOrThrow,
	noMatch,
	type StepRunResult,
	type StepRunner,
	type StepRunnerArgs,
} from '@nordicsemiconductor/bdd-markdown'
import assert from 'assert/strict'
import mqtt from 'mqtt'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import type { Settings } from '../../nrfcloud/settings.js'
import type { World } from '../run-features.js'

const dbClient = new DynamoDBClient({})

const createDevice = async ({
	step,
	log: {
		step: { progress },
	},
	context: { devicesTable },
}: StepRunnerArgs<World>): Promise<StepRunResult> => {
	const match = /^There is a device as this JSON$/.exec(step.title)
	if (match === null) return noMatch

	const data = codeBlockOrThrow(step).code

	progress(`Put data into database ${devicesTable}`)
	const res = await dbClient.send(
		new PutItemCommand({
			TableName: devicesTable,
			Item: marshall(JSON.parse(data)),
		}),
	)

	progress(`Request status: ${res.$metadata.httpStatusCode}`)
}
const getDevice = async ({
	step,
	log: {
		step: { progress },
	},
	context: { devicesTable },
}: StepRunnerArgs<World>): Promise<StepRunResult> => {
	const match =
		/^The device id `(?<key>[^`]+)` should equal to this JSON$/.exec(step.title)
	if (match === null) return noMatch

	progress(`Get data with id ${match.groups?.key} from ${devicesTable}`)
	const res = await dbClient.send(
		new GetItemCommand({
			TableName: devicesTable,
			Key: {
				deviceId: { S: match.groups?.key ?? '' },
			},
		}),
	)

	progress(
		`Data returned from query: `,
		JSON.stringify(res.Item ?? {}, null, 2),
	)
	assert.deepEqual(
		unmarshall(res.Item ?? {}),
		JSON.parse(codeBlockOrThrow(step).code),
	)
}

const publishDeviceMessage =
	(bridgeInfo: Settings) =>
	async ({
		step,
		log: {
			step: { progress, error },
		},
	}: StepRunnerArgs<World>): Promise<StepRunResult> => {
		const match =
			/^a device with id `(?<id>[^`]+)` publishes to topic `(?<topic>[^`]+)` with a message as this JSON$/.exec(
				step.title,
			)
		if (match === null) return noMatch

		const message = JSON.parse(codeBlockOrThrow(step).code)
		progress(
			`Device id ${match.groups?.id} publishes to topic ${match.groups?.topic}`,
		)
		await new Promise((resolve, reject) => {
			const mqttClient = mqtt.connect({
				host: bridgeInfo.mqttEndpoint,
				port: 8883,
				protocol: 'mqtts',
				protocolVersion: 4,
				clean: true,
				clientId: match.groups?.id ?? '',
				key: bridgeInfo.accountDevicePrivateKey,
				cert: bridgeInfo.accountDeviceClientCert,
				ca: readFileSync(
					path.join(process.cwd(), 'data', 'AmazonRootCA1.pem'),
					'utf-8',
				),
			})

			mqttClient.on('connect', () => {
				progress('connected')
				const topic = `${bridgeInfo.mqttTopicPrefix}${
					match.groups?.topic ?? ''
				}`
				progress('publishing', message, topic)
				mqttClient.publish(topic, JSON.stringify(message), (error) => {
					if (error) return reject(error)
					mqttClient.end()
					return resolve(void 0)
				})
			})

			mqttClient.on('error', (err) => {
				error(err)
				reject(err)
			})
		})
	}

export const steps = (bridgeInfo: Settings): StepRunner<World>[] => [
	createDevice,
	getDevice,
	publishDeviceMessage(bridgeInfo),
]
