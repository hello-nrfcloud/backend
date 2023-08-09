import type { Logger } from '@aws-lambda-powertools/logger'
import { type Metrics } from '@aws-lambda-powertools/metrics'
import {
	QueryCommand,
	type TimestreamQueryClient,
} from '@aws-sdk/client-timestream-query'
import { Context } from '@hello.nrfcloud.com/proto/hello'
import { parseResult } from '@nordicsemiconductor/timestream-helpers'
import { type Static } from '@sinclair/typebox'
import { transformTimestreamData } from './transformTimestreamData.js'
import { getSensorQueryStatement } from './getSensorQueryStatement.js'
import { HistoricalDataTimeSpans } from './HistoricalDataTimeSpans.js'
import {
	CommonAggregatedRequest,
	CommonAggregatedResponse,
} from '@hello.nrfcloud.com/proto/hello/history'

export const getHistoricalSensorData =
	({
		timestream,
		historicalDataDatabaseName,
		historicalDataTableName,
		log,
	}: {
		timestream: TimestreamQueryClient
		historicalDataDatabaseName: string
		historicalDataTableName: string
		log?: Logger
		track?: (...args: Parameters<Metrics['addMetric']>) => void
	}) =>
	async ({
		deviceId,
		model,
		request,
	}: {
		deviceId: string
		model: string
		request: Static<typeof CommonAggregatedRequest>
	}): Promise<Static<typeof CommonAggregatedResponse>> => {
		const context = Context.model(model).transformed(request.message)

		// Query data
		const QueryString = getSensorQueryStatement({
			type: request.type as keyof typeof HistoricalDataTimeSpans,
			attributes: request.attributes,
			deviceId,
			context,
			historicalDataDatabaseName,
			historicalDataTableName,
		})
		log?.debug(`[historicalDataRepository]`, { QueryString })
		const res = await timestream.send(
			new QueryCommand({
				QueryString,
			}),
		)

		// Transform request
		const attributes: Record<string, unknown[]> = {}
		const parsedResult = parseResult(res)
		for (const attribute in request.attributes) {
			attributes[attribute] = transformTimestreamData(parsedResult, [
				{
					fromKey: attribute,
					toKey: request.attributes[attribute]?.attribute ?? 'unknown',
				},
			])
		}

		return {
			'@context': Context.historicalDataResponse.toString(),
			'@id': request['@id'],
			attributes: attributes as Static<
				typeof CommonAggregatedResponse
			>['attributes'],
			type: request.type,
			message: request.message,
		}
	}
