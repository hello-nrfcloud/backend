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

export const steps = ({ db }: { db: DynamoDBClient }): StepRunner<World>[] => {
	const mockShadowData = async ({
		step,
		log: {
			step: { progress },
		},
		context: { responsesTableName },
	}: StepRunnerArgs<World>): Promise<StepRunResult> => {
		const match =
			/^there is a shadow data of device id `(?<deviceId>[^`]+)` in nRF Cloud as this JSON$/.exec(
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

	const mockGroundFix = async ({
		step,
		log: {
			step: { progress },
		},
		context: { responsesTableName },
	}: StepRunnerArgs<World>): Promise<StepRunResult> => {
		const match = /^there is a ground fix API response as this JSON$/.exec(
			step.title,
		)
		if (match === null) return noMatch

		const data = codeBlockOrThrow(step).code

		const methodPathQuery = `POST v1/location/ground-fix`
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
					ttl: {
						N: `${Math.round(Date.now() / 1000) + 5 * 60}`,
					},
					keep: {
						BOOL: false,
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
	}: StepRunnerArgs<{ [k: string]: unknown }>): Promise<StepRunResult> => {
		const match = matchGroups(
			Type.Object({
				duration: Type.Integer(),
				deviceId: Type.String(),
			}),
			{
				duration: (s) => parseInt(s, 10),
			},
		)(
			/^the duration between 2 consecutive device shadow requests for `(?<deviceId>[^`]+)` should be `(?<duration>[^`]+)` second\(s\)$/,
			step.title,
		)

		if (match === null) return noMatch

		let requestsTableName = ''
		if (
			'requestsTableName' in context &&
			typeof context['requestsTableName'] === 'string'
		) {
			requestsTableName = context['requestsTableName']
		}
		const timestamp = new Date(context['ts'] as number).toISOString()

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
					':timestamp': { S: timestamp },
				},
				ProjectionExpression: '#timestamp',
				ScanIndexForward: false,
				Limit: 2,
			}),
		)
		const resultObj = result?.Items?.map((item) => unmarshall(item))
		progress(`Query mock requests with timestamp: ${timestamp}`)
		progress(
			`Query mock requests result: ${JSON.stringify(resultObj, null, 2)}`,
		)

		assert.equal(resultObj?.length, 2)
		if (resultObj !== undefined && resultObj.length == 2) {
			const timeA = new Date(resultObj[0]?.timestamp).getTime()
			const timeB = new Date(resultObj[1]?.timestamp).getTime()
			const roundedDiff = Math.round((timeA - timeB) / 1000)
			assert.equal(roundedDiff, match.duration)
		}
	}

	return [mockShadowData, mockGroundFix, durationBetweenRequests]
}
