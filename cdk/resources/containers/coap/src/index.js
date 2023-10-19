import { writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'

const run = async ({ command, args }) => {
	return new Promise((resolve, reject) => {
		const cwd = '/function'
		console.log(`Run command: "${command}" with "${args}" at "${cwd}"`)

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

				const outputs = (stdout || stderr).replace(/^[\d\-:,\s]+|\s*$/gm, '')
				return resolve(outputs.split(os.EOL))
			},
		)
	})
}

export const createDeviceProperties = (
	devicePropertiesLocation,
	deviceProperties,
) => {
	const { deviceId, publicKey, privateKey, host, port } = deviceProperties
	// Generate device.properties
	const data = `
deviceId=${deviceId}
host=${host}
port=${port}
privateKey=${privateKey.trim().split('\n').slice(1, -1).join('')}
publicKey=${publicKey.trim().split('\n').slice(1, -1).join('')}
    `
	writeFileSync(devicePropertiesLocation, data)
}

const redact = (event) => {
	return {
		...event,
		deviceProperties: Object.fromEntries(
			Object.entries(event.deviceProperties).map(([key, value]) => {
				return [key, key.includes('Key') ? '***' : value]
			}),
		),
	}
}

export const handler = async (event) => {
	console.log('EVENT: ', redact(event))

	try {
		const devicePropertiesFile = path.join(
			os.tmpdir(),
			`${event.deviceProperties.deviceId}.properties`,
		)
		createDeviceProperties(devicePropertiesFile, event.deviceProperties)

		const result = await run({
			command: 'coap-simulator/bin/coap-simulator',
			args: event.args.concat(['-c', devicePropertiesFile]),
		})

		const response = {
			statusCode: 200,
			body: result,
		}

		return response
	} catch (error) {
		return {
			statusCode: 400,
			body: error.message,
		}
	}
}
