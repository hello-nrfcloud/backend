import type { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import type { SSMClient } from '@aws-sdk/client-ssm'
import type { ipShadow } from '@hello.nrfcloud.com/proto/nrfCloud/types/types.js'
import chalk from 'chalk'
import { merge } from 'lodash-es'
import mqtt, { MqttClient } from 'mqtt'
import { EventEmitter } from 'node:events'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { getDeviceFingerprint } from '../../devices/getDeviceFingerprint.js'
import { apiClient } from '../../nrfcloud/apiClient.js'
import { getAPISettings } from '../../nrfcloud/settings.js'
import { version } from '../../package.json'
import type { CommandDefinition } from './CommandDefinition.js'

export const simulateDeviceCommand = ({
	ssm,
	stackName,
	db,
	devicesTableName,
}: {
	ssm: SSMClient
	stackName: string

	db: DynamoDBClient
	devicesTableName: string
}): CommandDefinition => ({
	command: 'simulate-device <deviceId>',
	action: async (deviceId) => {
		const maybeFingerprint = await getDeviceFingerprint({
			db,
			devicesTableName,
		})(deviceId)
		if ('error' in maybeFingerprint) {
			throw new Error(maybeFingerprint.error.message)
		}
		console.log(chalk.yellow('Device ID:  '), chalk.blue(deviceId))
		console.log(
			chalk.yellow('Fingerprint:'),
			chalk.blue(maybeFingerprint.fingerprint),
		)

		const { apiKey, apiEndpoint } = await getAPISettings({
			ssm,
			stackName,
		})()
		const client = apiClient({
			endpoint: apiEndpoint,
			apiKey,
		})
		const accountInfo = await client.account()
		if ('error' in accountInfo) {
			console.error(accountInfo.error.message)
			console.error(`Failed to fetch nRF Cloud account information.`)
			process.exit(1)
		}
		console.log(
			chalk.yellow('MQTT endpoint:'),
			chalk.blue(accountInfo.account.mqttEndpoint),
		)

		// Device private key
		const devicePrivateKeyLocation = path.join(
			process.cwd(),
			'certificates',
			`${deviceId}.key`,
		)
		console.log(
			chalk.yellow('Private key:'),
			chalk.blue(devicePrivateKeyLocation),
		)
		// Device certificate
		const deviceCertificateLocation = path.join(
			process.cwd(),
			'certificates',
			`${deviceId}.signed.pem`,
		)
		console.log(
			chalk.yellow('Signed certificate:'),
			chalk.blue(deviceCertificateLocation),
		)

		console.log()

		const [key, cert, ca] = await Promise.all([
			readFile(devicePrivateKeyLocation, 'utf-8'),
			readFile(deviceCertificateLocation, 'utf-8'),
			readFile(path.join(process.cwd(), 'data', 'AmazonRootCA1.pem'), 'utf-8'),
		])

		const connection = await new Promise<{
			client: MqttClient
			end: () => Promise<void>
			publish: (topic: string, payload: Record<string, any>) => void
			onDelta: (handler: (message: Record<string, any>) => void) => void
		}>((resolve, reject) => {
			const mqttClient = mqtt.connect({
				host: accountInfo.account.mqttEndpoint,
				port: 8883,
				protocol: 'mqtts',
				protocolVersion: 4,
				clean: true,
				clientId: deviceId,
				key,
				cert,
				ca,
			})

			const endPromise = new Promise<void>((resolve) => {
				mqttClient.on('close', () => {
					console.log(chalk.gray('Disconnected.'))
					resolve()
				})
			})

			const em = new EventEmitter()

			mqttClient.on('connect', () => {
				console.log(chalk.cyan(deviceId), chalk.green('connected!'))
				resolve({
					client: mqttClient,
					end: async () => {
						mqttClient.end()
						return endPromise
					},
					publish: (topic, payload) => {
						console.debug(
							chalk.blue.dim('>'),
							chalk.gray(`[${new Date().toISOString().slice(11, 19)}]`),
							chalk.blue(topic),
						)
						console.debug(
							chalk.blue.dim('>'),
							chalk.blue(JSON.stringify(payload)),
						)
						mqttClient.publish(topic, JSON.stringify(payload))
					},
					onDelta: (cb) => em.on('delta', cb),
				})
			})

			mqttClient.on('error', (err) => {
				reject(err)
			})

			const deltaTopic = `$aws/things/${deviceId}/shadow/update/delta`
			mqttClient.subscribe(deltaTopic)
			mqttClient.on('message', (topic, payload) => {
				const message = payload.toString()
				console.debug(
					chalk.magenta.dim('<'),
					chalk.gray(`[${new Date().toISOString().slice(11, 19)}]`),
					chalk.magenta(topic),
				)
				console.debug(chalk.magenta.dim('<'), chalk.magenta(message))

				switch (topic) {
					case deltaTopic:
						em.emit('delta', JSON.parse(message).state)
				}
			})
		})

		process.on('SIGINT', async () => {
			console.log(chalk.gray('Closing connection ...'))

			await connection.end()

			process.exit()
		})

		let reported: ipShadow['reported'] = {
			config: {
				activeMode: true,
				activeWaitTime: 60,
				locationTimeout: 300,
				movementResolution: 120,
				movementTimeout: 3600,
				accThreshAct: 4,
				accThreshInact: 4,
				accTimeoutInact: 60,
				nod: [],
			},
			device: {
				deviceInfo: {
					appVersion: version,
					modemFirmware: `simulator-${version}`,
					board: 'PCA20035+solar',
					imei: generateIMEI(),
				},
				simInfo: {
					uiccMode: 1,
					iccid: '8944511616143691045',
					imsi: '234500004623194',
				},
				networkInfo: {
					currentBand: 12,
					supportedBands: '(2,3,4,8,12,13,20,28)\r\n',
					areaCode: 35412,
					mccmnc: 310411,
					ipAddress: '10.171.63.64',
					ueMode: 2,
					cellID: 84187657,
					networkMode: 'LTE-M',
					eest: 8,
				},
			},
		}

		connection.onDelta((message) => {
			reported = merge(reported, message)
			connection.publish(`$aws/things/${deviceId}/shadow/update`, {
				state: { reported },
			})
		})

		connection.publish(`$aws/things/${deviceId}/shadow/update`, {
			state: { reported },
		})

		// Publish location
		connection.publish(
			`${accountInfo.account.mqttTopicPrefix}m/d/${deviceId}/d2c`,
			{
				appId: 'GROUND_FIX',
				messageType: 'DATA',
				data: {
					lte: [
						{
							eci: 84561173,
							mcc: 240,
							mnc: 7,
							tac: 34209,
							earfcn: 6400,
							rsrp: -91,
							rsrq: -10.5,
							nmr: [
								{
									earfcn: 6400,
									pci: 98,
									rsrp: -93,
									rsrq: -11.5,
								},
								{
									earfcn: 6400,
									pci: 177,
									rsrp: -98,
									rsrq: -14,
								},
								{
									earfcn: 6400,
									pci: 62,
									rsrp: -99,
									rsrq: -14,
								},
								{
									earfcn: 6400,
									pci: 72,
									rsrp: -103,
									rsrq: -20,
								},
							],
						},
					],
				},
			},
		)

		// Publish sensor readings

		const batteryReadings = dataGenerator({
			min: 4000,
			max: 5000,
			step: 10,
		})

		const publishTemp = () => {
			connection.publish(
				`${accountInfo.account.mqttTopicPrefix}m/d/${deviceId}/d2c`,
				{
					appId: 'VOLTAGE',
					messageType: 'DATA',
					ts: Date.now(),
					data: batteryReadings.next().value.toString(),
				},
			)
		}

		const gainReadings = dataGenerator({
			min: 0,
			max: 5,
			step: 0.1,
		})

		const publishGain = () => {
			connection.publish(
				`${accountInfo.account.mqttTopicPrefix}m/d/${deviceId}/d2c`,
				{
					appId: 'SOLAR',
					messageType: 'DATA',
					ts: Date.now(),
					data: gainReadings.next().value.toString(),
				},
			)
		}

		publishTemp()
		publishGain()
		setInterval(publishTemp, 10 * 1000)
		setInterval(publishGain, 10 * 1000)
	},
	help: 'Simulates a device',
})

function* dataGenerator({
	min,
	max,
	step,
}: {
	min: number
	max: number
	step: number
}): Generator<number> {
	let v = min
	while (true) {
		yield v
		v += step
		if (v >= max || v <= min) {
			step = -step
		}
	}
}

const generateIMEI = () => `3566642${Math.floor(Math.random() * 100000000)}`
