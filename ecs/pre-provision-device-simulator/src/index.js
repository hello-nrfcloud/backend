import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb'
import { marshall } from '@aws-sdk/util-dynamodb'
import { generateDeviceCertificate, getCACertificate } from './lib/cert.js'

const client = new DynamoDBClient({})
try {
	const { key: caKey, cert: caCert } = await getCACertificate()
	const count = isNaN(+process.env.COUNT) ? 10 : +process.env.COUNT
	for (let i = 0; i < count; i++) {
		const { imei, key, cert, signed } = await generateDeviceCertificate(
			caKey,
			caCert,
		)
		await client.send(
			new PutItemCommand({
				TableName: process.env.TABLE_NAME,
				Item: marshall({
					deviceId: imei,
					name: `IMEI-${imei}`,
					caCert: caCert,
					caKey: caKey,
					key,
					cert,
					signed,
				}),
			}),
		)
	}

	console.log('Done')
} catch (error) {
	console.error('ERROR: ', error)
}
