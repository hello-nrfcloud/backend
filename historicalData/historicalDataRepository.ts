import type { Logger } from '@aws-lambda-powertools/logger'
import { type Metrics } from '@aws-lambda-powertools/metrics'
import {
	QueryCommand,
	type TimestreamQueryClient,
} from '@aws-sdk/client-timestream-query'
import { Context } from '@hello.nrfcloud.com/proto/hello'
import {
	HistoricalDataRequest,
	HistoricalDataResponse,
} from '@hello.nrfcloud.com/proto/hello/history'
import { parseResult } from '@nordicsemiconductor/timestream-helpers'
import { type Static } from '@sinclair/typebox'
import { getQueryStatement } from './getQueryStatement.js'
import { createTrailOfCoordinates } from '../util/createTrailOfCoordinates.js'
import { transformTimestreamData } from './transformTimestreamData.js'
import { normalizedData } from './normalizedData.js'

export const HistoricalChartTypes = {
	lastHour: {
		bin: '1minute',
		duration: '1hour',
		expires: '1minute',
	},
	lastDay: {
		bin: '5minutes',
		duration: '24hours',
		expires: '5minutes',
	},
	lastWeek: {
		bin: '1hour',
		duration: '7day',
		expires: '5minutes',
	},
	lastMonth: {
		bin: '1hour',
		duration: '30days',
		expires: '15minutes',
		aggregateRequired: true,
	},
}

export type HistoricalRequest = Static<typeof HistoricalDataRequest>
export type HistoricalResponse = Static<typeof HistoricalDataResponse>

export const historicalDataRepository = ({
	timestream,
	historicalDataDatabaseName,
	historicalDataTableName,
}: {
	timestream: TimestreamQueryClient
	historicalDataDatabaseName: string
	historicalDataTableName: string
	log?: Logger
	track?: (...args: Parameters<Metrics['addMetric']>) => void
}): {
	getHistoricalData: ({
		deviceId,
		model,
		request,
	}: {
		deviceId: string
		model: string
		request: HistoricalRequest
	}) => Promise<HistoricalResponse>
} => ({
	getHistoricalData: async ({ deviceId, model, request }) => {
		const context = Context.model(model).transformed(request.message)

		// Query data
		const QueryString = getQueryStatement({
			request,
			deviceId,
			context,
			historicalDataDatabaseName,
			historicalDataTableName,
		})
		const res = await timestream.send(
			new QueryCommand({
				QueryString,
			}),
		)

		// Transform request
		let attributes: Record<string, unknown[]> | Record<string, unknown>[]
		if (request.message === 'location' || request.message === 'locationTrail') {
			const parsedResult = normalizedData(parseResult(res))
			const requestedAttributes = request.attributes
			if (request.message === 'locationTrail') {
				// Make sure lat, lng, and ts are set
				requestedAttributes['lat'] = { attribute: 'lat' }
				requestedAttributes['lng'] = { attribute: 'lng' }
				requestedAttributes['ts'] = { attribute: 'ts' }
			}
			const mapKeys = Object.entries(requestedAttributes).map(([k, v]) => ({
				fromKey: v.attribute,
				toKey: k,
			}))

			attributes = transformTimestreamData(parsedResult, mapKeys)

			if (request.message === 'locationTrail')
				attributes = createTrailOfCoordinates(
					request.minDistanceKm,
					attributes as {
						lat: number
						lng: number
						ts: number
					}[],
				)
		} else {
			const parsedResult = parseResult(res)
			attributes = {}
			for (const attribute in request.attributes) {
				attributes[attribute] = transformTimestreamData(parsedResult, [
					{
						fromKey: attribute,
						toKey: request.attributes[attribute]?.attribute ?? 'unknown',
					},
				])
			}
		}

		const response: HistoricalResponse = {
			'@context': Context.historicalDataResponse.toString(),
			'@id': request['@id'],
			attributes: attributes as HistoricalResponse['attributes'],
			type: request.type,
			message: request.message,
		}

		return response
	},
})
