import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb'
import {
	codeBlockOrThrow,
	noMatch,
	type StepRunResult,
	type StepRunner,
	type StepRunnerArgs,
} from '@nordicsemiconductor/bdd-markdown'
import { setTimeout } from 'node:timers/promises'
import type { World } from '../run-features.js'

export const steps = ({ db }: { db: DynamoDBClient }): StepRunner<World>[] => {
	const mockShadowData = async ({
		step,
		log: {
			step: { progress },
		},
		context: { responsesTableName },
	}: StepRunnerArgs<World>): Promise<StepRunResult> => {
		const match =
			/^there is a shadow data of device id `(?<deviceId>[^`]+)` in nRF Cloud as this JSON$/.exec(
				step.title,
			)
		if (match === null) return noMatch

		const data = codeBlockOrThrow(step).code
		const methodPathQuery = `GET v1/devices/${match.groups?.deviceId}`
		progress(`Mock http url: ${methodPathQuery}`)
		await db.send(
			new PutItemCommand({
				TableName: responsesTableName,
				Item: {
					methodPathQuery: {
						S: methodPathQuery,
					},
					timestamp: {
						S: new Date().toISOString(),
					},
					statusCode: {
						N: `200`,
					},
					body: {
						S: `Content-Type: application/json

${data}
						`,
					},
					ttl: {
						N: `${Math.round(Date.now() / 1000) + 5 * 60}`,
					},
					keep: {
						BOOL: true,
					},
				},
			}),
		)
	}

	const waitForScheduler = async ({
		step,
		log: {
			step: { progress },
		},
	}: StepRunnerArgs<World>): Promise<StepRunResult> => {
		const match = /^wait for `(?<time>\d+)` minute\(s\)$/.exec(step.title)
		if (match === null) return noMatch

		const waitingTime = Number(match.groups?.time ?? 1)

		progress(`Waiting for ${waitingTime} minute(s)`)
		await setTimeout(waitingTime * 60 * 1000)
	}

	return [mockShadowData, waitForScheduler]
}
