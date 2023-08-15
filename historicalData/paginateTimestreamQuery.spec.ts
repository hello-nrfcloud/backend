import {
	type QueryCommandOutput,
	type TimestreamQueryClient,
} from '@aws-sdk/client-timestream-query'
import { paginateTimestreamQuery } from './paginateTimestreamQuery.js'

const result: QueryCommandOutput = {
	$metadata: {
		httpStatusCode: 200,
		requestId: 'C5RRDRVKHTX2SZDW4NC6EJHHAU',
		attempts: 1,
		totalRetryDelay: 0,
	},
	ColumnInfo: [
		{ Name: 'deviceId', Type: { ScalarType: 'VARCHAR' } },
		{ Name: 'measure_name', Type: { ScalarType: 'VARCHAR' } },
		{ Name: 'measure_value::double', Type: { ScalarType: 'DOUBLE' } },
		{ Name: 'time', Type: { ScalarType: 'TIMESTAMP' } },
	],
	QueryId: 'AEDQCANOKLEZ6W635XJ666CPANWN5KWVUO2FUM3ITOSBC7ALBH7SFHZ2BGMXLKQ',
	QueryStatus: {
		CumulativeBytesMetered: 10000000,
		CumulativeBytesScanned: 633144,
		ProgressPercentage: 100,
	},
	Rows: [
		{
			Data: [
				{ ScalarValue: 'oob-352656108602296' },
				{ ScalarValue: 'lng' },
				{ ScalarValue: '10.42999506' },
				{ ScalarValue: '2023-08-15 11:53:26.411000000' },
			],
		},
		{
			Data: [
				{ ScalarValue: 'oob-352656108602296' },
				{ ScalarValue: 'lat' },
				{ ScalarValue: '63.41999531' },
				{ ScalarValue: '2023-08-15 11:53:26.411000000' },
			],
		},
		{
			Data: [
				{ ScalarValue: 'oob-352656108602296' },
				{ ScalarValue: 'acc' },
				{ ScalarValue: '2420.0' },
				{ ScalarValue: '2023-08-15 11:53:26.411000000' },
			],
		},
	],
}

describe('paginateTimestreamQuery()', () => {
	it('should return the result for a query', async () => {
		const client: TimestreamQueryClient = {
			send: jest.fn(() => result),
		} as any

		expect(
			await paginateTimestreamQuery(client)(
				"SELECT deviceId, measure_name, measure_value::double, time FROM \"historicalData07AF2C3C-B8xvZ9KBGFEL\".\"historicalDatahistoricalDataTable305CFA9D-SLuHYYxeZrFZ\" WHERE deviceId = 'oob-352656108602296' AND \"@context\" = 'https://github.com/hello-nrfcloud/proto/transformed/PCA20035%2Bsolar/location' AND measure_name in ('lat','lng','acc','ts') AND time BETWEEN from_milliseconds(1692100425553) - 24hour AND from_milliseconds(1692100425553) ORDER BY time DESC",
			),
		).toMatchObject({
			ColumnInfo: [
				{ Name: 'deviceId', Type: { ScalarType: 'VARCHAR' } },
				{ Name: 'measure_name', Type: { ScalarType: 'VARCHAR' } },
				{ Name: 'measure_value::double', Type: { ScalarType: 'DOUBLE' } },
				{ Name: 'time', Type: { ScalarType: 'TIMESTAMP' } },
			],
			Rows: [
				{
					Data: [
						{ ScalarValue: 'oob-352656108602296' },
						{ ScalarValue: 'lng' },
						{ ScalarValue: '10.42999506' },
						{ ScalarValue: '2023-08-15 11:53:26.411000000' },
					],
				},
				{
					Data: [
						{ ScalarValue: 'oob-352656108602296' },
						{ ScalarValue: 'lat' },
						{ ScalarValue: '63.41999531' },
						{ ScalarValue: '2023-08-15 11:53:26.411000000' },
					],
				},
				{
					Data: [
						{ ScalarValue: 'oob-352656108602296' },
						{ ScalarValue: 'acc' },
						{ ScalarValue: '2420.0' },
						{ ScalarValue: '2023-08-15 11:53:26.411000000' },
					],
				},
			],
		})

		expect(client.send).toHaveBeenCalledTimes(1)
		expect(client.send).toHaveBeenCalledWith(
			expect.objectContaining({
				input: {
					QueryString:
						"SELECT deviceId, measure_name, measure_value::double, time FROM \"historicalData07AF2C3C-B8xvZ9KBGFEL\".\"historicalDatahistoricalDataTable305CFA9D-SLuHYYxeZrFZ\" WHERE deviceId = 'oob-352656108602296' AND \"@context\" = 'https://github.com/hello-nrfcloud/proto/transformed/PCA20035%2Bsolar/location' AND measure_name in ('lat','lng','acc','ts') AND time BETWEEN from_milliseconds(1692100425553) - 24hour AND from_milliseconds(1692100425553) ORDER BY time DESC",
				},
			}),
		)
	})

	it('should paginate results', async () => {
		let i = 0
		const client: TimestreamQueryClient = {
			send: jest.fn(() => {
				if (i++ === 0)
					return {
						$metadata: {
							httpStatusCode: 200,
							requestId: 'I7LFTUBTZCBSMBNBAYA6BDRXY4',
							attempts: 1,
							totalRetryDelay: 0,
						},
						ColumnInfo: [
							{ Name: 'deviceId', Type: { ScalarType: 'VARCHAR' } },
							{ Name: 'measure_name', Type: { ScalarType: 'VARCHAR' } },
							{ Name: 'measure_value::double', Type: { ScalarType: 'DOUBLE' } },
							{ Name: 'time', Type: { ScalarType: 'TIMESTAMP' } },
						],
						NextToken:
							'AYABeGGHYzF_hHhXNpgJ59yiGq4AAAABAAdhd3Mta21zAEthcm46YXdzOmttczpldS13ZXN0LTE6OTE1MDI5ODcxMTUwOmtleS9mZjFiZTZlOC1iZGViLTQ4YWEtYTA2OC00ODc5NjU5MjA1ZWEAuAECAQB4gtqFl61m253Iqer-hHY67hlrm-aXj61tl3PKkv8Tmc8BcUKfry8enV-UTWFQj-knkQAAAH4wfAYJKoZIhvcNAQcGoG8wbQIBADBoBgkqhkiG9w0BBwEwHgYJYIZIAWUDBAEuMBEEDGtuOPL3cJ8ZT4dvyAIBEIA7ixJ40c15IvkfFylooP8c4Axwt2AOGC0qyWwnhhlx6TykpfpNArfMDEgcduzda3lQuEem_iTpL0ZMspcCAAAAAAwAABAAAAAAAAAAAAAAAAAAIIZW-2Ash3l-2kGHBZ9Mrf____8AAAABAAAAAAAAAAAAAAABAAABJA1Fe_KQpo7pbt1G79RodbzOZ7ix6hOOli1_gLYw5_HSTvXBSVoPn_wWHSc-IHlVn3td2WwZUwdISiKJLdRfbohxKUHv0vecO-60ck4tTNQTkPrSFAnDFf-kqspqFWPfX2F-u_QOmRFzNU5Jnn3UsdnnCxZZvhG2D8Z6MjlGg4sKjs7mnHyx3lxPVdk2IIPWu03Hd4mWifiArmMFuatrkl72blcLc2Z6raAcu4xmlhmwa3yG72YuCxyU4mWBX3CvxRfjJbby58767kEjUhiKvhEUfFLogRWU-JbyOCoIlLhBtDHy-DLm4nTdirUqFDBSSKA2A50rY3ePLcQDLEDv76T4R2-jkyxbwJ4myNPHNSP1hgPRzpf--O4ClXjuEFW8i9RDNKc2X-HcMVzKmmSOELNe0NFg',
						QueryId:
							'AEDQCANOKLJYHN4BLBP27WRVUTQNCTKKORZNXPQOPGK6GZICGQTTUBDS2WHUG2I',
						QueryStatus: {
							CumulativeBytesMetered: 15409316,
							CumulativeBytesScanned: 15409316,
							ProgressPercentage: 16.853932584269664,
						},
						Rows: [
							{
								Data: [
									{ ScalarValue: 'oob-352656108602296' },
									{ ScalarValue: 'lng' },
									{ ScalarValue: '10.42999506' },
									{ ScalarValue: '2023-08-15 11:53:26.666000000' },
								],
							},
							{
								Data: [
									{ ScalarValue: 'oob-352656108602296' },
									{ ScalarValue: 'lat' },
									{ ScalarValue: '63.41999531' },
									{ ScalarValue: '2023-08-15 11:53:26.666000000' },
								],
							},
							{
								Data: [
									{ ScalarValue: 'oob-352656108602296' },
									{ ScalarValue: 'acc' },
									{ ScalarValue: '2420.0' },
									{ ScalarValue: '2023-08-15 11:53:26.666000000' },
								],
							},
						],
					}
				return result
			}),
		} as any

		expect(
			await paginateTimestreamQuery(client)(
				"SELECT deviceId, measure_name, measure_value::double, time FROM \"historicalData07AF2C3C-B8xvZ9KBGFEL\".\"historicalDatahistoricalDataTable305CFA9D-SLuHYYxeZrFZ\" WHERE deviceId = 'oob-352656108602296' AND \"@context\" = 'https://github.com/hello-nrfcloud/proto/transformed/PCA20035%2Bsolar/location' AND measure_name in ('lat','lng','acc','ts') AND time BETWEEN from_milliseconds(1692101009025) - 30day AND from_milliseconds(1692101009025) ORDER BY time DESC",
			),
		).toMatchObject({
			ColumnInfo: [
				{ Name: 'deviceId', Type: { ScalarType: 'VARCHAR' } },
				{ Name: 'measure_name', Type: { ScalarType: 'VARCHAR' } },
				{ Name: 'measure_value::double', Type: { ScalarType: 'DOUBLE' } },
				{ Name: 'time', Type: { ScalarType: 'TIMESTAMP' } },
			],
			Rows: [
				{
					Data: [
						{ ScalarValue: 'oob-352656108602296' },
						{ ScalarValue: 'lng' },
						{ ScalarValue: '10.42999506' },
						{ ScalarValue: '2023-08-15 11:53:26.666000000' },
					],
				},
				{
					Data: [
						{ ScalarValue: 'oob-352656108602296' },
						{ ScalarValue: 'lat' },
						{ ScalarValue: '63.41999531' },
						{ ScalarValue: '2023-08-15 11:53:26.666000000' },
					],
				},
				{
					Data: [
						{ ScalarValue: 'oob-352656108602296' },
						{ ScalarValue: 'acc' },
						{ ScalarValue: '2420.0' },
						{ ScalarValue: '2023-08-15 11:53:26.666000000' },
					],
				},
				{
					Data: [
						{ ScalarValue: 'oob-352656108602296' },
						{ ScalarValue: 'lng' },
						{ ScalarValue: '10.42999506' },
						{ ScalarValue: '2023-08-15 11:53:26.411000000' },
					],
				},
				{
					Data: [
						{ ScalarValue: 'oob-352656108602296' },
						{ ScalarValue: 'lat' },
						{ ScalarValue: '63.41999531' },
						{ ScalarValue: '2023-08-15 11:53:26.411000000' },
					],
				},
				{
					Data: [
						{ ScalarValue: 'oob-352656108602296' },
						{ ScalarValue: 'acc' },
						{ ScalarValue: '2420.0' },
						{ ScalarValue: '2023-08-15 11:53:26.411000000' },
					],
				},
			],
		})

		expect(client.send).toHaveBeenCalledTimes(2)
		expect(client.send).toHaveBeenCalledWith(
			expect.objectContaining({
				input: {
					QueryString:
						"SELECT deviceId, measure_name, measure_value::double, time FROM \"historicalData07AF2C3C-B8xvZ9KBGFEL\".\"historicalDatahistoricalDataTable305CFA9D-SLuHYYxeZrFZ\" WHERE deviceId = 'oob-352656108602296' AND \"@context\" = 'https://github.com/hello-nrfcloud/proto/transformed/PCA20035%2Bsolar/location' AND measure_name in ('lat','lng','acc','ts') AND time BETWEEN from_milliseconds(1692101009025) - 30day AND from_milliseconds(1692101009025) ORDER BY time DESC",
				},
			}),
		)
		expect(client.send).toHaveBeenCalledWith(
			expect.objectContaining({
				input: {
					QueryString:
						"SELECT deviceId, measure_name, measure_value::double, time FROM \"historicalData07AF2C3C-B8xvZ9KBGFEL\".\"historicalDatahistoricalDataTable305CFA9D-SLuHYYxeZrFZ\" WHERE deviceId = 'oob-352656108602296' AND \"@context\" = 'https://github.com/hello-nrfcloud/proto/transformed/PCA20035%2Bsolar/location' AND measure_name in ('lat','lng','acc','ts') AND time BETWEEN from_milliseconds(1692101009025) - 30day AND from_milliseconds(1692101009025) ORDER BY time DESC",
					NextToken:
						'AYABeGGHYzF_hHhXNpgJ59yiGq4AAAABAAdhd3Mta21zAEthcm46YXdzOmttczpldS13ZXN0LTE6OTE1MDI5ODcxMTUwOmtleS9mZjFiZTZlOC1iZGViLTQ4YWEtYTA2OC00ODc5NjU5MjA1ZWEAuAECAQB4gtqFl61m253Iqer-hHY67hlrm-aXj61tl3PKkv8Tmc8BcUKfry8enV-UTWFQj-knkQAAAH4wfAYJKoZIhvcNAQcGoG8wbQIBADBoBgkqhkiG9w0BBwEwHgYJYIZIAWUDBAEuMBEEDGtuOPL3cJ8ZT4dvyAIBEIA7ixJ40c15IvkfFylooP8c4Axwt2AOGC0qyWwnhhlx6TykpfpNArfMDEgcduzda3lQuEem_iTpL0ZMspcCAAAAAAwAABAAAAAAAAAAAAAAAAAAIIZW-2Ash3l-2kGHBZ9Mrf____8AAAABAAAAAAAAAAAAAAABAAABJA1Fe_KQpo7pbt1G79RodbzOZ7ix6hOOli1_gLYw5_HSTvXBSVoPn_wWHSc-IHlVn3td2WwZUwdISiKJLdRfbohxKUHv0vecO-60ck4tTNQTkPrSFAnDFf-kqspqFWPfX2F-u_QOmRFzNU5Jnn3UsdnnCxZZvhG2D8Z6MjlGg4sKjs7mnHyx3lxPVdk2IIPWu03Hd4mWifiArmMFuatrkl72blcLc2Z6raAcu4xmlhmwa3yG72YuCxyU4mWBX3CvxRfjJbby58767kEjUhiKvhEUfFLogRWU-JbyOCoIlLhBtDHy-DLm4nTdirUqFDBSSKA2A50rY3ePLcQDLEDv76T4R2-jkyxbwJ4myNPHNSP1hgPRzpf--O4ClXjuEFW8i9RDNKc2X-HcMVzKmmSOELNe0NFg',
				},
			}),
		)
	})
})
