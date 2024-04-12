import {
	DynamoDBClient,
	PutItemCommand,
	QueryCommand,
	ScanCommand,
} from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import {
	codeBlockOrThrow,
	regExpMatchedStep,
	type StepRunner,
} from '@nordicsemiconductor/bdd-markdown'
import { Type } from '@sinclair/typebox'
import type { SSMClient } from '@aws-sdk/client-ssm'
import { parseMockRequest } from './parseMockRequest.js'
import {
	arrayContaining,
	check,
	objectMatching,
	stringContaining,
	greaterThan,
	lessThan,
} from 'tsmatchers'
import { parseMockResponse } from './parseMockResponse.js'
import { toPairs } from './toPairs.js'
import pRetry from 'p-retry'
import {
	sortQuery,
	sortQueryString,
} from '@bifravst/http-api-mock/sortQueryString'
import { URLSearchParamsToObject } from '@bifravst/http-api-mock/URLSearchParamsToObject'
import { getAllAccountsSettings } from '@hello.nrfcloud.com/nrfcloud-api-helpers/settings'

export const steps = ({
	db,
	responsesTableName,
	requestsTableName,
	ssm,
	stackName,
}: {
	db: DynamoDBClient
	responsesTableName: string
	requestsTableName: string
	ssm: SSMClient
	stackName: string
}): StepRunner<Record<string, any>>[] => {
	const mockShadowData = regExpMatchedStep(
		{
			regExp:
				/^there is this device shadow data for `(?<deviceId>[^`]+)` in nRF Cloud$/,
			schema: Type.Object({
				deviceId: Type.String(),
			}),
		},
		async ({ match: { deviceId }, log: { progress }, step }) => {
			const data = codeBlockOrThrow(step).code

			const query = new URLSearchParams({
				includeState: 'true',
				includeStateMeta: 'true',
				pageLimit: '100',
				deviceIds: deviceId,
			})

			const methodPathQuery = `GET v1/devices?${sortQuery(query)}`
			progress(`Mock http url: ${methodPathQuery}`)
			await db.send(
				new PutItemCommand({
					TableName: responsesTableName,
					Item: marshall({
						methodPathQuery,
						timestamp: new Date().toISOString(),
						statusCode: 200,
						body: [`Content-Type: application/json`, ``, data].join('\n'),
						queryParams: {
							...URLSearchParamsToObject(query),
							deviceIds: `/\\b${deviceId}\\b/`, // Check using RegEx
						},
						ttl: Math.round(Date.now() / 1000) + 5 * 60,
						keep: true,
					}),
				}),
			)
		},
	)

	const durationBetweenRequests = regExpMatchedStep(
		{
			regExp:
				/^the duration between 2 consecutive device shadow requests for `(?<deviceId>[^`]+)` should be `(?<duration>[^`]+)` seconds?$/,
			schema: Type.Object({
				duration: Type.Integer(),
				deviceId: Type.String(),
			}),
			converters: {
				duration: (s) => parseInt(s, 10),
			},
		},
		async ({ match: { duration, deviceId }, log: { progress } }) => {
			// We need to use scan here because the query string parameter deviceId may include more deviceIDs than just the one we are looking for.
			const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)

			const scanRequests = async (attempt: number) => {
				const result = await db.send(
					new ScanCommand({
						TableName: requestsTableName,
						FilterExpression:
							'#method = :method AND #path = :path AND #timestamp >= :timestamp',
						ExpressionAttributeNames: {
							'#method': 'method',
							'#path': 'path',
							'#query': 'query',
							'#timestamp': 'timestamp',
						},
						ExpressionAttributeValues: {
							':method': { S: 'GET' },
							':path': { S: 'v1/devices' },
							':timestamp': { S: fiveMinutesAgo.toISOString() },
						},
						ProjectionExpression: '#timestamp, #query',
					}),
				)
				const resultObj = (result?.Items ?? [])
					.map(
						(item) =>
							unmarshall(item) as {
								timestamp: string
								query?: Record<string, any>
							},
					)
					.filter(({ query }) => {
						progress('query', JSON.stringify(query))
						try {
							check(query ?? {}).is(
								objectMatching({
									includeState: 'true',
									includeStateMeta: 'true',
									pageLimit: '100',
									deviceIds: stringContaining(deviceId),
								}),
							)
							return true
						} catch {
							return false
						}
					})
				progress(
					`Query mock requests result:`,
					JSON.stringify(resultObj, null, 2),
				)

				if (resultObj.length < 2)
					throw new Error(`Waiting for at least 2 mock requests`)

				const timeDiffBetweenRequests = toPairs(
					resultObj.sort(({ timestamp: t1 }, { timestamp: t2 }) =>
						t1.localeCompare(t2),
					),
				).map(
					([i1, i2]) =>
						new Date(i2.timestamp).getTime() - new Date(i1.timestamp).getTime(),
				)

				progress(
					`(Attempt: ${attempt}): time diff`,
					JSON.stringify(timeDiffBetweenRequests),
				)

				try {
					const allowedMarginInMS = 1000
					check(timeDiffBetweenRequests).is(
						arrayContaining(
							greaterThan(duration * 1000).and(
								lessThan(duration * 1000 + allowedMarginInMS),
							),
						),
					)
				} catch {
					throw new Error(
						`mock requests did not happen within the configured duration (${duration})`,
					)
				}
			}

			await pRetry(scanRequests, {
				retries: 5,
				minTimeout: duration * 1000,
				maxTimeout: duration * 1000 * 2,
			})
		},
	)

	const queueResponse = regExpMatchedStep(
		{
			regExp:
				/^this nRF Cloud API is queued for a `(?<methodPathQuery>[^`]+)` request$/,
			schema: Type.Object({
				methodPathQuery: Type.String(),
			}),
		},
		async ({ match: { methodPathQuery }, log: { progress }, step }) => {
			const expectedResponse = codeBlockOrThrow(step).code
			const response = parseMockResponse(expectedResponse)
			progress(`expected resource: ${methodPathQuery}`)
			const [method, resource] = methodPathQuery.split(' ') as [string, string]

			const body: string[] = [
				...Object.entries(response.headers).map(([k, v]) => `${k}: ${v}`),
			].filter((v) => v)
			if (response.body.length > 0) {
				body.push(``, response.body)
			}

			await db.send(
				new PutItemCommand({
					TableName: responsesTableName,
					Item: {
						methodPathQuery: {
							S: `${method} ${sortQueryString(resource.slice(1))}`,
						},
						timestamp: {
							S: new Date().toISOString(),
						},
						statusCode: {
							N: response.statusCode.toString(),
						},
						body: body.length > 0 ? { S: body.join('\n') } : { NULL: true },
						ttl: {
							N: `${Math.round(Date.now() / 1000) + 5 * 60}`,
						},
						keep: {
							BOOL: true,
						},
					},
				}),
			)
		},
	)

	const expectRequest = <StepRunner>{
		match: (title) =>
			/^the nRF Cloud API should have been called with$/.test(title),
		run: async ({ log: { progress }, step }) => {
			const expectedRequest = codeBlockOrThrow(step).code

			const request = parseMockRequest(expectedRequest)
			let expectedBody = request.body
			if (
				Object.entries(request.headers)
					.map(([k, v]) => [k.toLowerCase(), v])
					.find(([k]) => k === 'content-type')?.[1]
					?.includes('application/json') === true
			) {
				expectedBody = JSON.stringify(JSON.parse(expectedBody))
			}

			const methodPathQuery = `${request.method} ${sortQueryString(request.resource.slice(1))}`
			progress(`expected resource: ${methodPathQuery}`)

			const result = await db.send(
				new QueryCommand({
					TableName: requestsTableName,
					KeyConditionExpression: '#methodPathQuery = :methodPathQuery',
					ExpressionAttributeNames: {
						'#methodPathQuery': 'methodPathQuery',
						'#body': 'body',
						'#headers': 'headers',
					},
					ExpressionAttributeValues: {
						':methodPathQuery': { S: methodPathQuery },
					},
					ProjectionExpression: '#body, #headers',
					ScanIndexForward: false,
				}),
			)

			const matchedRequest = (result.Items ?? [])
				.map((item) => unmarshall(item))
				.find(({ body, headers }) => {
					progress(`body: ${body}`)
					progress(`expected: ${expectedBody}`)
					progress(`headers: ${headers}`)
					try {
						return (
							body === expectedBody &&
							check(JSON.parse(headers)).is(objectMatching(request.headers))
						)
					} catch (err) {
						progress(JSON.stringify(err))
						return false
					}
				})

			if (matchedRequest !== undefined) {
				progress(`Matched request`, JSON.stringify(matchedRequest))
				return
			}

			throw new Error(`No request matched.`)
		},
	}

	const checkAPIKeyRequest = regExpMatchedStep(
		{
			regExp:
				/^the shadow for `(?<deviceId>[^`]+)` in the `(?<account>[^`]+)` account has been requested$/,
			schema: Type.Object({
				deviceId: Type.String(),
				account: Type.String(),
			}),
		},
		async ({ match: { deviceId, account }, log: { progress } }) => {
			const allNRFCloudSettings = await getAllAccountsSettings({
				ssm,
				stackName,
			})
			const allAccountsAPKeys = Object.entries(allNRFCloudSettings).reduce(
				(result, [account, settings]) => {
					return {
						...result,
						[account]: settings.apiKey,
					}
				},
				{} as Record<string, string>,
			)
			const expectedAPIKey = allAccountsAPKeys[account]
			if (expectedAPIKey === undefined) throw new Error('Cannot find API key')

			// We need to use scan here because the query string parameter deviceId may include more deviceIDs than just the one we are looking for.
			const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)
			const scanRequests = async (attempt: number) => {
				const result = await db.send(
					new ScanCommand({
						TableName: requestsTableName,
						FilterExpression:
							'#method = :method AND #resource = :resource AND #timestamp >= :timestamp',
						ExpressionAttributeNames: {
							'#method': 'method',
							'#resource': 'resource',
							'#query': 'query',
							'#headers': 'headers',
							'#timestamp': 'timestamp',
						},
						ExpressionAttributeValues: {
							':method': { S: 'GET' },
							':resource': { S: 'v1/devices' },
							':timestamp': { S: fiveMinutesAgo.toISOString() },
						},
						ProjectionExpression: '#timestamp, #query, #headers',
					}),
				)

				const resultObj = (result?.Items ?? [])
					.map(
						(item) =>
							unmarshall(item) as {
								timestamp: string
								query?: Record<string, any>
								headers: string
							},
					)
					.find(({ query, headers }) => {
						try {
							check(query ?? {}).is(
								objectMatching({
									includeState: 'true',
									includeStateMeta: 'true',
									pageLimit: '100',
									deviceIds: stringContaining(deviceId),
								}),
							)
							progress('headers', headers)
							check(JSON.parse(headers)).is(
								objectMatching({
									Authorization: stringContaining(expectedAPIKey),
								}),
							)
							return true
						} catch {
							return false
						}
					})

				progress(
					`(Attempt: ${attempt}): Query mock requests result:`,
					JSON.stringify(resultObj, null, 2),
				)
				if (resultObj === undefined)
					throw new Error(`Waiting for request with ${expectedAPIKey} API key`)
			}

			await pRetry(scanRequests, {
				retries: 5,
				minTimeout: 5000,
				maxTimeout: 10000,
			})
		},
	)

	return [
		mockShadowData,
		durationBetweenRequests,
		expectRequest,
		queueResponse,
		checkAPIKeyRequest,
	]
}
