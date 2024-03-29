import { writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { type Handler } from 'aws-lambda'

type DeviceProperties = {
	deviceId: string
	publicKey: string
	privateKey: string
	host: string
	port: number
}

type Event = { deviceProperties: DeviceProperties; args: string[] }

type EventResponse = {
	statusCode: number
	body?: string | string[]
}

const run = async ({
	command,
	args,
}: {
	command: string
	args: string[]
}): Promise<string[]> =>
	new Promise((resolve, reject) => {
		const cwd = '/function'
		console.log(
			`Run command: "${command}" with "${args.join(',')}" at "${cwd}"`,
		)

		execFile(
			command,
			args,
			{
				cwd,
			},
			(error, stdout, stderr) => {
				if (error) {
					return reject(error)
				}

				const outputs = stdout || stderr
				return resolve(outputs.split(os.EOL).filter(Boolean))
			},
		)
	})

export const createDeviceProperties = (
	devicePropertiesLocation: string,
	deviceProperties: DeviceProperties,
): void => {
	const { deviceId, publicKey, privateKey, host, port } = deviceProperties
	// Generate device.properties
	const data = [
		`deviceId=${deviceId}`,
		`host=${host}`,
		`port=${port}`,
		`privateKey=${privateKey.trim().split('\n').slice(1, -1).join('')}`,
		`publicKey=${publicKey.trim().split('\n').slice(1, -1).join('')}`,
	].join('\n')

	writeFileSync(devicePropertiesLocation, data)
}

const redact = (event: Event): Event => ({
	...event,
	deviceProperties: Object.fromEntries(
		Object.entries(event.deviceProperties).map(([key, value]) => {
			return [key, key.includes('Key') ? '***' : value]
		}),
	) as DeviceProperties,
})

export const handler: Handler<Event, EventResponse> = async (event) => {
	console.log('EVENT: ', redact(event))

	try {
		const devicePropertiesFile = path.join(
			os.tmpdir(),
			`${event.deviceProperties.deviceId}.properties`,
		)
		const deviceDtlsSession = path.join(
			os.tmpdir(),
			`${event.deviceProperties.deviceId}.properties.session`,
		)
		createDeviceProperties(devicePropertiesFile, event.deviceProperties)

		const result = await run({
			command: 'coap-simulator/bin/coap-simulator',
			args: event.args.concat([
				'--config',
				devicePropertiesFile,
				'--dtls-session',
				deviceDtlsSession,
			]),
		})

		const response = {
			statusCode: 200,
			body: result,
		}

		return response
	} catch (error) {
		if (error instanceof Error) {
			return {
				statusCode: 400,
				body: error.message,
			}
		} else {
			return {
				statusCode: 400,
			}
		}
	}
}
