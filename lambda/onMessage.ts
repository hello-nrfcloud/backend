import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb'
import { ECSClient, LaunchType, RunTaskCommand } from '@aws-sdk/client-ecs'
import { EventBridge } from '@aws-sdk/client-eventbridge'
import { proto } from '@bifravst/muninn-proto/Muninn/proto.js'
import { fromEnv } from '@nordicsemiconductor/from-env'
import type {
	APIGatewayProxyStructuredResultV2,
	APIGatewayProxyWebsocketEventV2,
} from 'aws-lambda'
import { logger } from './logger.js'
const { TableName, EventBusName, ClusterName, TaskDefinitionArn, Subnets } =
	fromEnv({
		TableName: 'WEBSOCKET_CONNECTIONS_TABLE_NAME',
		EventBusName: 'EVENTBUS_NAME',
		ClusterName: 'CLUSTER_NAME',
		TaskDefinitionArn: 'TASK_DEFINITION_ARN',
		Subnets: 'SUBNETS',
	})(process.env)

const log = logger('message')
const db = new DynamoDBClient({})
const eventBus = new EventBridge({})
const ecs = new ECSClient({})

const publishToWebsocket = async ({
	deviceId,
	message,
}: {
	deviceId: string
	message: Record<string, any>
}): Promise<void> => {
	await eventBus.putEvents({
		Entries: [
			{
				EventBusName,
				Source: 'thingy.ws',
				DetailType: 'message',
				Detail: JSON.stringify({
					deviceId,
					message,
				}),
			},
		],
	})
}

export const handler = async (
	event: APIGatewayProxyWebsocketEventV2,
): Promise<APIGatewayProxyStructuredResultV2> => {
	log.info('onMessage event', { event })
	if (event.body === undefined) {
		return { statusCode: 400 }
	}

	// Query device id based on connection id
	const { Item } = await db.send(
		new GetItemCommand({
			TableName,
			Key: {
				connectionId: {
					S: event.requestContext.connectionId,
				},
			},
		}),
	)
	const deviceId = Item?.deviceId?.S ?? 'unknown'
	const model = Item?.model?.S ?? 'generic'

	const body = JSON.parse(event.body)
	const action = body.action
	let message = body.message ?? {}

	switch (action) {
		case 'broadcast':
			break
		case 'create': {
			const { apiKey, count } = message
			if (apiKey !== undefined && count !== undefined && /\d+/.test(count)) {
				await ecs.send(
					new RunTaskCommand({
						cluster: ClusterName,
						launchType: LaunchType.FARGATE,
						taskDefinition: TaskDefinitionArn,
						networkConfiguration: {
							awsvpcConfiguration: {
								assignPublicIp: 'DISABLED',
								subnets: Subnets.split(','),
							},
						},
						overrides: {
							// If using container overrides, container name must be specific; https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_ContainerOverride.html
							containerOverrides: [
								{
									name: 'deviceGenerator',
									environment: [
										{
											name: 'COUNT',
											value: `${count}`,
										},
										{
											name: 'SENDER',
											value: `${deviceId}`,
										},
										{
											name: 'API_KEY',
											value: `${apiKey}`,
										},
									],
								},
							],
						},
					}),
				)

				message = {
					message: `Request to create simulator devices is received`,
				}
			} else {
				message = {
					error: `apiKey or count is missing`,
				}
			}
			break
		}
	}

	for (const transformed of await proto({
		onError: (message, model, error) =>
			log.error('Could not transform message', { message, model, error }),
	})(model, message)) {
		await publishToWebsocket({
			deviceId,
			message: transformed,
		})
	}

	return {
		statusCode: 200,
		body: `Got your message, ${event.requestContext.connectionId}!`,
	}
}
