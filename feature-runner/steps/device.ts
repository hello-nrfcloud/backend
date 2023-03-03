import {
	DynamoDBClient,
	GetItemCommand,
	PutItemCommand,
} from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import {
	codeBlockOrThrow,
	noMatch,
	StepRunner,
	StepRunnerArgs,
	StepRunResult,
} from '@nordicsemiconductor/bdd-markdown'
import assert from 'assert/strict'
import type { World } from '../run-features.js'

const dbClient = new DynamoDBClient({})

async function createDevice({
	step,
	log: {
		step: { progress },
	},
	context: { devicesTable },
}: StepRunnerArgs<World>): Promise<StepRunResult> {
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

async function getDevice({
	step,
	log: {
		step: { progress },
	},
	context: { devicesTable },
}: StepRunnerArgs<World>): Promise<StepRunResult> {
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

export const steps = (): StepRunner<World>[] => {
	return [createDevice, getDevice]
}
