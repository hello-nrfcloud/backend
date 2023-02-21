import {
	DynamoDBClient,
	ExecuteStatementCommand,
} from '@aws-sdk/client-dynamodb'
import { unmarshall } from '@aws-sdk/util-dynamodb'
import { readFile, writeFile } from 'node:fs/promises'

type CliInput = {
	region: string | undefined
	awsAccessKey: string | undefined
	awsSecretKey: string | undefined
	table: string
	number: number
	duration: number
}

const DATA_FILE = 'data.csv'
const LOADTEST_FILE = 'simulator.yml'

export async function simulate(input: CliInput): Promise<void> {
	const options = {}
	if (input.region !== undefined)
		Object.assign(options, { region: input.region })
	if (input.awsAccessKey !== undefined)
		process.env.AWS_ACCESS_KEY_ID = input.awsAccessKey
	if (input.awsSecretKey !== undefined)
		process.env.AWS_SECRET_ACCESS_KEY = input.awsSecretKey

	const client = new DynamoDBClient({})
	const res = await client.send(
		new ExecuteStatementCommand({
			Statement: `select deviceId, imei, "key", signed from "${input.table}"`,
			Limit: input.number,
		}),
	)

	const csv: string[] = []
	res.Items?.map((item) => {
		const data = unmarshall(item)
		csv.push(`${data.deviceId},${data.imei},"${data.key}","${data.signed}"`)
		return data
	})
	await writeFile(DATA_FILE, csv.join('\n'))

	const fileData = await readFile(LOADTEST_FILE, { encoding: 'utf-8' })
	const newFileContent = fileData
		.replace(/duration\:\s*(\d+)/m, `duration: ${input.duration}`)
		.replace(/maxVusers\:\s*(\d+)/m, `maxVusers: ${csv.length}`)
	await writeFile(LOADTEST_FILE, newFileContent)

	console.log(`${DATA_FILE} is created!`)
}
