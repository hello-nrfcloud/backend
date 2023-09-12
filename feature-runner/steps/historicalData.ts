import { type TimestreamQueryClient } from '@aws-sdk/client-timestream-query'
import {
	codeBlockOrThrow,
	groupMatcher,
	type StepRunner,
} from '@nordicsemiconductor/bdd-markdown'
import { parseResult } from '@nordicsemiconductor/timestream-helpers'
import { Type } from '@sinclair/typebox'
import * as chai from 'chai'
import { expect } from 'chai'
import chaiSubset from 'chai-subset'
import pRetry from 'p-retry'
import { convertMessageToTimestreamRecords } from '../../historicalData/convertMessageToTimestreamRecords.js'
import { storeRecordsInTimestream } from '../../historicalData/storeRecordsInTimestream.js'
import { paginateTimestreamQuery } from '../../historicalData/paginateTimestreamQuery.js'

chai.use(chaiSubset)

let lastResult: Record<string, unknown>[] = []

const queryTimestream = (
	timestream: TimestreamQueryClient,
	historicalDataTableInfo: string,
) => {
	const queryTimestream = paginateTimestreamQuery(timestream)
	return groupMatcher(
		{
			regExp:
				/^I query Timestream for the device `(?<deviceId>[^`]+)` and the dimension `(?<dimension>[^`]+)` with the value `(?<value>[^`]+)` starting at `(?<tsISO>[^`]+)`$/,
			schema: Type.Object({
				deviceId: Type.String(),
				dimension: Type.String(),
				value: Type.String(),
				tsISO: Type.String(),
			}),
		},
		async ({
			match: { deviceId, dimension, value, tsISO },
			log: { progress },
		}) => {
			const [historicaldataDatabaseName, historicaldataTableName] =
				historicalDataTableInfo.split('|')

			const QueryString = [
				`SELECT *`,
				`FROM "${historicaldataDatabaseName}"."${historicaldataTableName}"`,
				`WHERE deviceId='${deviceId}' AND "${dimension}"='${value}'`,
				`AND time >= from_iso8601_timestamp('${tsISO}')`,
				`ORDER BY time DESC`,
				`LIMIT 1`,
			].join(' ')
			progress(`Query timestream: ${QueryString}`)
			const query = async () => {
				const res = await queryTimestream(QueryString)
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
		},
	)
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

const assertResult = <StepRunner>{
	match: (title) => /^the Timestream result should match$/.test(title),
	run: async ({ step }) => {
		expect(lastResult).to.containSubset(
			JSON.parse(codeBlockOrThrow(step).code, dateParser),
		)
	},
}

const writeTimestream = (store: ReturnType<typeof storeRecordsInTimestream>) =>
	groupMatcher(
		{
			regExp:
				/^I write Timestream for the device `(?<deviceId>[^`]+)` with this message$/,
			schema: Type.Object({
				deviceId: Type.String(),
			}),
		},
		async ({ match: { deviceId }, step, log: { progress } }) => {
			const message = JSON.parse(codeBlockOrThrow(step).code)
			await store(convertMessageToTimestreamRecords(message), {
				Dimensions: [
					{
						Name: 'deviceId',
						Value: deviceId,
					},
				],
			})

			progress(`Write to timestream: ${JSON.stringify(message, null, 2)}`)
		},
	)

export const steps = ({
	timestream,
	storeTimestream,
	historicalDataTableInfo,
}: {
	timestream: TimestreamQueryClient
	storeTimestream: ReturnType<typeof storeRecordsInTimestream>
	historicalDataTableInfo: string
}): StepRunner<Record<string, any>>[] => [
	queryTimestream(timestream, historicalDataTableInfo),
	writeTimestream(storeTimestream),
	assertResult,
]
