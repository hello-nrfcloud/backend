import type { Logger } from '@aws-lambda-powertools/logger'
import {
	QueryCommand,
	type TimestreamQueryClient,
} from '@aws-sdk/client-timestream-query'
import {
	Context,
	HistoricalDataRequest,
	HistoricalDataResponse,
	chartProto,
} from '@hello.nrfcloud.com/proto/hello'
import { parseResult } from '@nordicsemiconductor/timestream-helpers'
import { Type, type Static } from '@sinclair/typebox'
import { Value } from '@sinclair/typebox/value'
import { groupBy } from 'lodash-es'
import { getQueryStatement } from './queryGenerator.js'

export const HistoricalChartTypes = {
	lastDay: {
		bin: '5minutes',
		duration: '24hours',
		expires: '5minutes',
	},
	lastHour: {
		bin: '1minute',
		duration: '1hour',
		expires: '1minute',
	},
	lastMonth: {
		bin: '1hour',
		duration: '30days',
		expires: '15minutes',
		aggregateRequired: true,
	},
}

export type HistoricalRequest = Omit<
	Static<typeof HistoricalDataRequest>,
	'data'
>
type HistoricalResponse = Static<typeof HistoricalDataResponse>

export const transformTimestreamData = (
	data: Record<string, unknown>[],
	mapKeys: { fromKey: string; toKey: string }[],
): Record<string, unknown>[] => {
	const transformedData = []

	// Added ts to mapKeys as default
	mapKeys.push({ fromKey: 'time', toKey: 'ts' })

	const groupedData = groupBy(data, (d) => d.time)
	for (const item in groupedData) {
		const data = groupedData[item]
		const tranformedRecord = data?.reduce<Record<string, unknown>>(
			(result, record) => {
				result = {
					...mapKeys.reduce<Record<string, unknown>>(
						(resultMapKeys, mapKey) => {
							if (mapKey.fromKey in record) {
								if (mapKey.fromKey === 'time') {
									resultMapKeys[mapKey.toKey] = (
										record[mapKey.fromKey] as Date
									).getTime()
								} else {
									resultMapKeys[mapKey.toKey] = record[mapKey.fromKey]
								}
							}
							return resultMapKeys
						},
						{},
					),
					...result,
				}
				return result
			},
			{},
		)
		if (tranformedRecord !== undefined) transformedData.push(tranformedRecord)
	}

	return transformedData
}

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
}): {
	getHistoricalData: ({
		deviceId,
		model,
		request,
	}: {
		deviceId: string
		model: string
		request: HistoricalRequest
	}) => Promise<HistoricalResponse[]>
} => ({
	getHistoricalData: async ({ deviceId, model, request }) => {
		const context = Context.model(model).transformed(request.message)

		// Validate request
		const R = Value.Check(Type.Omit(HistoricalDataRequest, ['data']), request)
		if (R !== true) {
			const errors = [
				...Value.Errors(Type.Omit(HistoricalDataRequest, ['data']), request),
			]
			log?.error(`Request is invalid`, { errors })
			throw new Error(`Request is invalid`)
		}

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
		const parsedResult = parseResult(res)
		const data: Record<string, unknown[]> = {}
		for (const attribute in request.attributes) {
			data[attribute] = transformTimestreamData(parsedResult, [
				{
					fromKey: attribute,
					toKey:
						request.attributes[attribute as keyof typeof request.attributes]
							.attribute,
				},
			])
		}
		const transformedRequest = {
			...request,
			data,
		}

		// Pass to proto
		const historicalResponses = await chartProto({
			onError: (message, model, error) => {
				log?.error('Could not transform historical request', {
					payload: message,
					model,
					error,
				})
			},
		})(model, transformedRequest)

		return historicalResponses
	},
})
