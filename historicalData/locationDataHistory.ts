import type { Logger } from '@aws-lambda-powertools/logger'
import { type Metrics } from '@aws-lambda-powertools/metrics'
import { type TimestreamQueryClient } from '@aws-sdk/client-timestream-query'
import { Context } from '@hello.nrfcloud.com/proto/hello'
import {
	LocationRequest,
	LocationResponse,
} from '@hello.nrfcloud.com/proto/hello/history'
import { parseResult } from '@nordicsemiconductor/timestream-helpers'
import { type Static } from '@sinclair/typebox'
import { transformTimestreamData } from './transformTimestreamData.js'
import { normalizedData } from './normalizedData.js'
import { getLocationQueryStatement } from './getLocationQueryStatement.js'
import { HistoricalDataTimeSpans } from './HistoricalDataTimeSpans.js'
import { paginateTimestreamQuery } from './paginateTimestreamQuery.js'

export const getHistoricalLocationData = ({
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
}): ((args: {
	deviceId: string
	model: string
	request: Static<typeof LocationRequest>
}) => Promise<Static<typeof LocationResponse>>) => {
	const query = paginateTimestreamQuery(timestream)
	return async ({ deviceId, model, request }) => {
		const context = Context.model(model).transformed(request.message)

		// Query data
		const QueryString = getLocationQueryStatement({
			type: request.type as keyof typeof HistoricalDataTimeSpans,
			attributes: request.attributes,
			deviceId,
			context,
			historicalDataDatabaseName,
			historicalDataTableName,
		})
		log?.debug(`[historicalDataRepository]`, { QueryString })

		const res = await query(QueryString)

		// Transform request
		const parsedResult = normalizedData(parseResult(res))
		const requestedAttributes = request.attributes
		const mapKeys = Object.entries(requestedAttributes).map(([k, v]) => ({
			fromKey: v.attribute,
			toKey: k,
		}))

		const attributes = transformTimestreamData(parsedResult, mapKeys)
		return {
			'@context': Context.historicalDataResponse.toString(),
			'@id': request['@id'],
			attributes: attributes as Static<typeof LocationResponse>['attributes'],
			type: request.type,
			message: request.message,
		}
	}
}
