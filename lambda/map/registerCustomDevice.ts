import { models } from '@hello.nrfcloud.com/proto-lwm2m'
import { randomWords } from '@nordicsemiconductor/random-words'
import { randomUUID } from 'node:crypto'
import { getAPISettings } from '../../nrfcloud/settings.js'
import { SSMClient } from '@aws-sdk/client-ssm'
import { STACK_NAME } from '../../cdk/stacks/stackConfig.js'
import { fromEnv } from '@nordicsemiconductor/from-env'
import { run } from '../../util/run.js'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type {
	APIGatewayProxyEventV2,
	APIGatewayProxyResultV2,
} from 'aws-lambda'
import { aProblem } from '../util/aProblem.js'
import { corsHeaders } from '../util/corsHeaders.js'
import { aResponse } from '../util/aResponse.js'

const { stackName } = fromEnv({ stackName: 'STACK_NAME' })({
	STACK_NAME,
	...process.env,
})
const ssm = new SSMClient({})

const { apiKey, apiEndpoint } = await getAPISettings({
	ssm,
	stackName,
	account: 'nordic',
})()

console.log(`apiKey`, `${apiKey.slice(0, 3)}***`)
console.log(`apiEndpoint`, apiEndpoint.toString())

/**
 * This registers a custom device, which allows arbitrary users to showcase their products on the map.
 */
export const handler = async (
	event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> => {
	console.log(JSON.stringify({ event }))
	const cors = corsHeaders(event, ['POST'], 60)
	if (event.requestContext.http.method === 'OPTIONS')
		return {
			statusCode: 200,
			headers: cors,
		}

	const { model, email } = JSON.parse(event.body ?? '{}')

	if (!Object.keys(models).includes(model))
		return aProblem(cors, {
			title: `Unknown model: ${model}`,
			status: 400,
		})

	const id = randomWords().join('-')
	const deviceId = `map-${randomUUID()}`
	const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), path.sep))
	console.log(tempDir)

	await run({
		command: 'openssl',
		args: [
			'ecparam',
			'-name',
			'prime256v1',
			'-genkey',
			'-param_enc',
			'explicit',
			'-out',
			path.join(tempDir, `${deviceId}.key`),
		],
	})

	await run({
		command: 'openssl',
		args: [
			'req',
			'-new',
			'-days',
			'10957',
			'-x509',
			'-subj',
			`/C=NO/ST=Trondelag/L=Trondheim/O=Nordic Semiconductor ASA/OU=hello.nrfcloud.com/emailAddress=${email}/CN=${deviceId}`,
			'-key',
			path.join(tempDir, `${deviceId}.key`),
			'-out',
			path.join(tempDir, `${deviceId}.pem`),
		],
	})

	const key = await fs.readFile(path.join(tempDir, `${deviceId}.key`), 'utf-8')

	const cert = await fs.readFile(path.join(tempDir, `${deviceId}.pem`), 'utf-8')

	console.log(
		await run({
			command: 'openssl',
			args: [
				'x509',
				'-in',
				path.join(tempDir, `${deviceId}.pem`),
				'-text',
				'-noout',
			],
		}),
	)

	return aResponse(cors, 200, {
		'@context': new URL(
			'https://github.com/hello-nrfcloud/proto/map/device-credentials',
		),
		id,
		deviceId,
		key,
		cert,
	})
}
