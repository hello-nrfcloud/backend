import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb'
import { marshall } from '@aws-sdk/util-dynamodb'
import { generateDeviceCertificate, getCACertificate } from './lib/cert.js'

try {
	let count = +(process.env.COUNT ?? '10')
	count = isNaN(count) ? 10 : count

	const client = new DynamoDBClient({})
	const { key: caKey, cert: caCert } = await getCACertificate()

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
