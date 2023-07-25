import {
	DynamoDBClient,
	PutItemCommand,
	QueryCommand,
} from '@aws-sdk/client-dynamodb'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import {
	codeBlockOrThrow,
	matchGroups,
	noMatch,
	type StepRunResult,
	type StepRunner,
	type StepRunnerArgs,
} from '@nordicsemiconductor/bdd-markdown'
import { Type } from '@sinclair/typebox'
import assert from 'assert/strict'
import type { World } from '../run-features.js'
import { getAllAccountsSettings } from '../../nrfcloud/allAccounts.js'
import type { SSMClient } from '@aws-sdk/client-ssm'

import { parseMockRequest } from './parseMockRequest.js'
import { check, objectMatching } from 'tsmatchers'
import { parseMockResponse } from './parseMockResponse.js'
let queryStartTime: Date | undefined

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
	const mockShadowData = async ({
		step,
		log: {
			step: { progress },
		},
	}: StepRunnerArgs<Record<string, any>>): Promise<StepRunResult> => {
		const match = matchGroups(
			Type.Object({
				deviceId: Type.String(),
			}),
		)(
			/^there is this device shadow data for `(?<deviceId>[^`]+)` in nRF Cloud$/,
			step.title,
		)
		if (match === null) return noMatch

		const data = codeBlockOrThrow(step).code

		const methodPathQuery = `GET v1/devices`
		progress(`Mock http url: ${methodPathQuery}`)
		await db.send(
			new PutItemCommand({
				TableName: responsesTableName,
				Item: {
					methodPathQuery: {
						S: methodPathQuery,
					},
					timestamp: {
						S: new Date().toISOString(),
					},
					statusCode: {
						N: `200`,
					},
					body: {
						S: `Content-Type: application/json

${data}
						`,
					},
					queryParams: {
						M: {
							includeState: { BOOL: true },
							includeStateMeta: { BOOL: true },
							pageLimit: { N: `100` },
							deviceIds: { S: `/\\b${match.deviceId}\\b/` },
						},
					},
					ttl: {
						N: `${Math.round(Date.now() / 1000) + 5 * 60}`,
					},
					keep: {
						BOOL: true,
					},
				},
			}),
		)
	}

	const durationBetweenRequests = async ({
		step,
		log: {
			step: { progress },
		},
	}: StepRunnerArgs<Record<string, any>>): Promise<StepRunResult> => {
		const match = matchGroups(
			Type.Object({
				duration: Type.Integer(),
				deviceId: Type.String(),
			}),
			{
				duration: (s) => parseInt(s, 10),
			},
		)(
			/^the duration between 2 consecutive device shadow requests for `(?<deviceId>[^`]+)` should be `(?<duration>[^`]+)` seconds?$/,
			step.title,
		)

		if (match === null) return noMatch

		if (queryStartTime === undefined) queryStartTime = new Date()
		const params: { [K: string]: any } = {
			includeState: true,
			includeStateMeta: true,
			pageLimit: 100,
			deviceIds: match.deviceId,
		}
		const queryString = Object.entries(params)
			.sort((a, b) => a[0].localeCompare(b[0]))
			.map((kv) => kv.map(encodeURIComponent).join('='))
			.join('&')

		const methodPathQuery = `GET v1/devices?${queryString}`
		progress(`Mock http url: ${methodPathQuery}`)
		const result = await db.send(
			new QueryCommand({
				TableName: requestsTableName,
				KeyConditionExpression:
					'#methodPathQuery = :methodPathQuery AND #timestamp >= :timestamp',
				ExpressionAttributeNames: {
					'#methodPathQuery': 'methodPathQuery',
					'#timestamp': 'timestamp',
				},
				ExpressionAttributeValues: {
					':methodPathQuery': { S: methodPathQuery },
					':timestamp': { S: queryStartTime.toISOString() },
				},
				ProjectionExpression: '#timestamp',
				ScanIndexForward: false,
				Limit: 2,
			}),
		)
		const resultObj = result?.Items?.map((item) => unmarshall(item))
		progress(`Query mock requests from ${queryStartTime.toISOString()}`)
		progress(
			`Query mock requests result: ${JSON.stringify(resultObj, null, 2)}`,
		)

		if (resultObj?.length !== 2)
			throw new Error(`Waiting for 2 consecutive mock requests`)

		const timeA = new Date(resultObj[0]?.timestamp).getTime()
		const timeB = new Date(resultObj[1]?.timestamp).getTime()
		const timeDiff = timeA - timeB
		const allowedMarginInMS = 1000
		const fitToSchedule =
			timeDiff >= match.duration * 1000 - allowedMarginInMS &&
			timeDiff <= match.duration * 1000 + allowedMarginInMS

		if (fitToSchedule !== true)
			throw new Error(
				`2 consecutive mock requests does not match with the configured duration (${match.duration})`,
			)

		queryStartTime = undefined
		assert.equal(fitToSchedule, true)
	}

	const queueResponse = async ({
		step,
		log: {
			step: { progress },
		},
	}: StepRunnerArgs<Record<string, any>>): Promise<StepRunResult> => {
		const rx =
			/^this nRF Cloud API is queued for a `(?<methodPathQuery>[^`]+)` request$/
		if (!rx.test(step.title)) return noMatch

		const expectedResponse = codeBlockOrThrow(step).code

		const response = parseMockResponse(expectedResponse)

		const methodPathQuery = rx.exec(step.title)?.groups
			?.methodPathQuery as string
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
						S: `${method} ${resource.slice(1)}`,
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
	}

	const expectRequest = async ({
		step,
		log: {
			step: { progress },
		},
	}: StepRunnerArgs<Record<string, any>>): Promise<StepRunResult> => {
		if (!/^the nRF Cloud API should have been called with$/.test(step.title))
			return noMatch

		const expectedRequest = codeBlockOrThrow(step).code

		const request = parseMockRequest(expectedRequest)

		const methodPathQuery = `${request.method} ${request.resource.slice(1)}`
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
				try {
					return (
						body === request.body &&
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
	}

	const checkAPIKeyRequest = async ({
		step,
		context: { requestsTableName },
		log: {
			step: { progress },
		},
	}: StepRunnerArgs<World>): Promise<StepRunResult> => {
		const match = matchGroups(
			Type.Object({
				deviceId: Type.String(),
				account: Type.String(),
			}),
		)(
			/^there is a device shadow request for `(?<deviceId>[^`]+)` with API key of `(?<account>[^`]+)` account$/,
			step.title,
		)

		if (match === null) return noMatch

		const allNRFCloudSettings = await getAllAccountsSettings({
			ssm,
			stackName,
		})()
		const allAccountsAPKeys = Object.entries(allNRFCloudSettings).reduce(
			(result, [account, settings]) => {
				if ('nrfCloudSettings' in settings) {
					return {
						...result,
						[account]: settings['nrfCloudSettings'].apiKey,
					}
				}

				return result
			},
			{} as Record<string, string>,
		)

		if (queryStartTime === undefined) queryStartTime = new Date()
		const params: { [K: string]: any } = {
			includeState: true,
			includeStateMeta: true,
			pageLimit: 100,
			deviceIds: match.deviceId,
		}
		const queryString = Object.entries(params)
			.sort((a, b) => a[0].localeCompare(b[0]))
			.map((kv) => kv.map(encodeURIComponent).join('='))
			.join('&')

		const methodPathQuery = `GET v1/devices?${queryString}`
		progress(`Mock http url: ${methodPathQuery}`)
		const result = await db.send(
			new QueryCommand({
				TableName: requestsTableName,
				KeyConditionExpression:
					'#methodPathQuery = :methodPathQuery AND #timestamp >= :timestamp',
				ExpressionAttributeNames: {
					'#methodPathQuery': 'methodPathQuery',
					'#headers': 'headers',
					'#timestamp': 'timestamp',
				},
				ExpressionAttributeValues: {
					':methodPathQuery': { S: methodPathQuery },
					':timestamp': { S: queryStartTime.toISOString() },
				},
				ProjectionExpression: '#timestamp, #headers',
				ScanIndexForward: false,
				Limit: 1,
			}),
		)
		const resultObj = result?.Items?.map((item) => unmarshall(item))
		progress(`Query mock requests from ${queryStartTime.toISOString()}`)
		progress(
			`Query mock requests result: ${JSON.stringify(resultObj, null, 2)}`,
		)

		if (resultObj?.length === 1) {
			const headers = JSON.parse(resultObj?.[0]?.headers ?? null)
			const apiKey = headers['Authorization']?.replace(/^bearer\s+/i, '')

			assert.equal(allAccountsAPKeys[match.account], apiKey)
		} else {
			throw new Error('Mock request is not found')
		}
	}

	return [
		mockShadowData,
		durationBetweenRequests,
		expectRequest,
		queueResponse,
		checkAPIKeyRequest,
	]
}
