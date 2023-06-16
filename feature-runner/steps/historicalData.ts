import {
	QueryCommand,
	type TimestreamQueryClient,
} from '@aws-sdk/client-timestream-query'
import {
	codeBlockOrThrow,
	matchGroups,
	noMatch,
	type StepRunResult,
	type StepRunner,
	type StepRunnerArgs,
} from '@nordicsemiconductor/bdd-markdown'
import { parseResult } from '@nordicsemiconductor/timestream-helpers'
import { Type } from '@sinclair/typebox'
import * as chai from 'chai'
import chaiSubset from 'chai-subset'
import pRetry from 'p-retry'
import type { World } from '../run-features.js'

chai.use(chaiSubset)

const dateParser = (key: string, value: any) => {
	if (typeof value === 'string') {
		const a =
			/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2}(?:\.\d*))(?:Z|(\+|-)([\d|:]*))?$/.exec(
				value,
			)
		if (a) return new Date(value)
	}

	return value
}

const queryTimestream =
	(timestream: TimestreamQueryClient) =>
	async ({
		step,
		log: {
			step: { progress },
		},
		context: { historicalDataTableInfo },
	}: StepRunnerArgs<World>): Promise<StepRunResult> => {
		const match = matchGroups(
			Type.Object({
				deviceId: Type.String(),
				dimension: Type.String(),
				value: Type.String(),
				tsISO: Type.String(),
			}),
		)(
			/^I query timestream for the device `(?<deviceId>[^`]+)` and the dimension `(?<dimension>[^`]+)` with the value `(?<value>[^`]+)` from `(?<tsISO>[^`]+)`. The response should match this JSON$/,
			step.title,
		)
		if (match === null) return noMatch

		const [historicaldataDatabaseName, historicaldataTableName] =
			historicalDataTableInfo.split('|')

		const QueryString = `
	SELECT *
	FROM "${historicaldataDatabaseName}"."${historicaldataTableName}"
	WHERE deviceId='${match.deviceId}' AND "${match.dimension}"='${match.value}'
	AND time >= from_iso8601_timestamp('${match.tsISO}')
	ORDER BY time DESC
	LIMIT 1
	`
		progress(`Query timestream: ${QueryString}`)
		const query = async () => {
			const res = await timestream.send(
				new QueryCommand({
					QueryString,
				}),
			)
			if (res.Rows?.length === 0) throw new Error('No record')

			return res
		}
		const res = await pRetry(query, {
			retries: 5,
			minTimeout: 1000,
			maxTimeout: 2000,
			onFailedAttempt: (error) => {
				progress(`attempt #${error.attemptNumber}`)
			},
		})

		// parseResult will parse date to date object not date string
		const data = parseResult(res)

		progress(`Result: ${JSON.stringify(data, null, 2)}`)
		chai
			.expect(data)
			.containSubset(JSON.parse(codeBlockOrThrow(step).code, dateParser))
	}

export const steps = ({
	timestream,
}: {
	timestream: TimestreamQueryClient
}): StepRunner<World>[] => [queryTimestream(timestream)]
