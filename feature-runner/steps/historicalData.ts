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
import { expect } from 'chai'
import chaiSubset from 'chai-subset'
import pRetry from 'p-retry'
import { convertMessageToTimestreamRecords } from '../../historicalData/convertMessageToTimestreamRecords.js'
import { storeRecordsInTimestream } from '../../historicalData/storeRecordsInTimestream.js'
import type { World } from '../run-features.js'

chai.use(chaiSubset)

let lastResult: Record<string, unknown>[] = []

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
			/^I query Timestream for the device `(?<deviceId>[^`]+)` and the dimension `(?<dimension>[^`]+)` with the value `(?<value>[^`]+)` starting at `(?<tsISO>[^`]+)`$/,
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
		lastResult = parseResult<Record<string, unknown>>(res)

		progress(`Result: ${JSON.stringify(lastResult, null, 2)}`)
	}

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

const assertResult = async ({
	step,
}: StepRunnerArgs<World>): Promise<StepRunResult> => {
	const match = /^the Timestream result should match$/.exec(step.title)
	if (match === null) return noMatch

	expect(lastResult).to.containSubset(
		JSON.parse(codeBlockOrThrow(step).code, dateParser),
	)
}

const writeTimestream =
	(store: ReturnType<typeof storeRecordsInTimestream>) =>
	async ({
		step,
		log: {
			step: { progress },
		},
	}: StepRunnerArgs<World>): Promise<StepRunResult> => {
		const match = matchGroups(
			Type.Object({
				deviceId: Type.String(),
			}),
		)(
			/^I write Timestream for the device `(?<deviceId>[^`]+)` with this message$/,
			step.title,
		)
		if (match === null) return noMatch

		const message = JSON.parse(codeBlockOrThrow(step).code)
		await store(convertMessageToTimestreamRecords(message), {
			Dimensions: [
				{
					Name: 'deviceId',
					Value: match.deviceId,
				},
			],
		})

		progress(`Write to timestream: ${JSON.stringify(message, null, 2)}`)
	}

export const steps = ({
	timestream,
	storeTimestream,
}: {
	timestream: TimestreamQueryClient
	storeTimestream: ReturnType<typeof storeRecordsInTimestream>
}): StepRunner<World>[] => [
	queryTimestream(timestream),
	writeTimestream(storeTimestream),
	assertResult,
]
