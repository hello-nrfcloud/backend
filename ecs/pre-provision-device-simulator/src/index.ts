import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb'
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs'
import { marshall } from '@aws-sdk/util-dynamodb'
import Joi from 'joi'
import { generateDeviceCertificate, getCACertificate } from './lib/cert.js'

const clientDB = new DynamoDBClient({})
const clientSQS = new SQSClient({})

const schema = Joi.object({
	API_KEY: Joi.string().required(),
	COUNT: Joi.number().integer().min(1).max(100).default(10),
	TABLE_NAME: Joi.string().required(),
	QUEUE_URL: Joi.string().required(),
	SENDER: Joi.string(),
}).unknown()
const { value: validateValue, error: validateError } = schema.validate(
	process.env,
	{ abortEarly: false },
)

try {
	if (validateError !== undefined) throw validateError

	const {
		API_KEY: apiKey,
		COUNT: count,
		TABLE_NAME: tableName,
		QUEUE_URL: queueUrl,
		SENDER: sender,
	} = validateValue
	const NRF_CLOUD_API_URL = 'https://api.nrfcloud.com/v1/'
	const csv: string[] = []

	const { key: caKey, cert: caCert } = await getCACertificate()
	for (let i = 0; i < count; i++) {
		const { imei, key, cert, signed } = await generateDeviceCertificate(
			caKey,
			caCert,
		)
		const deviceId = `nrf-${imei}`
		await clientDB.send(
			new PutItemCommand({
				TableName: tableName,
				Item: marshall({
					deviceId,
					imei,
					caCert,
					caKey,
					key,
					cert,
					signed,
				}),
			}),
		)
		csv.push(`${deviceId},PCA10090,CreatedBy:nrf.guide,APP|MODEM,"${signed}\n"`)
	}

	const res = await fetch(`${NRF_CLOUD_API_URL}devices`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${apiKey}`,
			'Content-Type': 'application/octet-stream',
		},
		body: csv.join('\n'),
	})

	if (res.ok) {
		if (sender !== undefined) {
			const { bulkOpsRequestId } = await res.json()
			console.log(`Publish to ${sender}: `, bulkOpsRequestId)
			await clientSQS.send(
				new SendMessageCommand({
					QueueUrl: queueUrl,
					MessageBody: JSON.stringify({
						sender,
						receivers: [sender],
						payload: {
							message: `${count} virtual device(s) have been created`,
							bulkOpsRequestId,
						},
					}),
				}),
			)
		}
	} else {
		const errMessage = await res.json()
		throw new Error(
			`Device API is failed with ${res.status} code: ${
				errMessage.message ?? errMessage
			}`,
		)
	}

	console.log('Simulator devices have been created.')
} catch (error) {
	const { QUEUE_URL: queueUrl, SENDER: sender } = validateValue

	if (queueUrl !== undefined && sender !== undefined) {
		await clientSQS.send(
			new SendMessageCommand({
				QueueUrl: queueUrl,
				MessageBody: JSON.stringify({
					sender,
					receivers: [sender],
					payload: {
						error: (error as Error).message,
					},
				}),
			}),
		)
	}

	console.error('ERROR: ', (error as Error).message)
}
