import {
	DynamoDBClient,
	PutItemCommand,
	QueryCommand,
} from '@aws-sdk/client-dynamodb'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import {
	codeBlockOrThrow,
	regExpMatchedStep,
	type StepRunner,
} from '@nordicsemiconductor/bdd-markdown'
import { Type } from '@sinclair/typebox'
import { check, objectMatching } from 'tsmatchers'
import { parseMockRequest } from './parseMockRequest.js'
import { parseMockResponse } from './parseMockResponse.js'

export const steps = ({
	db,
	responsesTableName,
	requestsTableName,
}: {
	db: DynamoDBClient
	responsesTableName: string
	requestsTableName: string
}): StepRunner<Record<string, any>>[] => {
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

	return [expectRequest, queueResponse]
}
