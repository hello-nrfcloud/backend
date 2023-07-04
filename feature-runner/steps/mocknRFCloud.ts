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

let queryStartTime: Date | undefined

export const steps = ({ db }: { db: DynamoDBClient }): StepRunner<World>[] => {
	const mockShadowData = async ({
		step,
		log: {
			step: { progress },
		},
		context: { responsesTableName },
	}: StepRunnerArgs<World>): Promise<StepRunResult> => {
		const match =
			/^there is this device shadow data for `(?<deviceId>[^`]+)` in nRF Cloud$/.exec(
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
							deviceIds: { S: `/\\b${match.groups?.deviceId}\\b/` },
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
		context,
	}: StepRunnerArgs<World>): Promise<StepRunResult> => {
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
				TableName: context.requestsTableName,
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

	return [mockShadowData, durationBetweenRequests]
}
