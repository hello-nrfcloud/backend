import type { Logger } from '@aws-lambda-powertools/logger'
import { type Metrics } from '@aws-lambda-powertools/metrics'
import {
	QueryCommand,
	type TimestreamQueryClient,
} from '@aws-sdk/client-timestream-query'
import { Context } from '@hello.nrfcloud.com/proto/hello'
import {
	BatteryRequest,
	BatteryResponse,
	GainRequest,
	GainResponse,
	LocationRequest,
	LocationResponse,
} from '@hello.nrfcloud.com/proto/hello/history'
import { parseResult } from '@nordicsemiconductor/timestream-helpers'
import { Type, type Static } from '@sinclair/typebox'
import { getQueryStatement } from './getQueryStatement.js'
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
export const SensorDataRequests = Type.Union([GainRequest, BatteryRequest])
export const SensorDataResponses = Type.Union([GainResponse, BatteryResponse])

export const historicalDataRepository = ({
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
}): {
	getHistoricalLocationData: ({
		deviceId,
		model,
		request,
	}: {
		deviceId: string
		model: string
		request: Static<typeof LocationRequest>
	}) => Promise<Static<typeof LocationResponse>>
	getHistoricalSensorData: ({
		deviceId,
		model,
		request,
	}: {
		deviceId: string
		model: string
		request: Static<typeof SensorDataRequests>
	}) => Promise<Static<typeof SensorDataResponses>>
} => ({
	getHistoricalLocationData: async ({ deviceId, model, request }) => {
		const context = Context.model(model).transformed(request.message)

		// Query data
		const QueryString = getQueryStatement({
			request,
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
	},
	getHistoricalSensorData: async ({ deviceId, model, request }) => {
		const context = Context.model(model).transformed(request.message)

		// Query data
		const QueryString = getQueryStatement({
			request,
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
				typeof SensorDataResponses
			>['attributes'],
			type: request.type,
			message: request.message,
		} as Static<typeof SensorDataResponses>
	},
})
