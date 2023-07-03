import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb'
import {
	codeBlockOrThrow,
	noMatch,
	type StepRunResult,
	type StepRunner,
	type StepRunnerArgs,
} from '@nordicsemiconductor/bdd-markdown'
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
			/^there is this device shadow data for `(?<deviceId>[^`]+)` in nRF Cloud$/.exec(
				step.title,
			)
		if (match === null) return noMatch

		const data = codeBlockOrThrow(step).code

		const methodPathQuery = `GET v1/devices`
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
					queryParams: {
						M: {
							includeState: { BOOL: true },
							includeStateMeta: { BOOL: true },
							pageLimit: { N: `100` },
							deviceIds: { S: `/\\b${match.groups?.deviceId}\\b/` },
						},
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

	return [mockShadowData]
}
