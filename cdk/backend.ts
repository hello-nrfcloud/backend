import { IoTClient } from '@aws-sdk/client-iot'
import { SSMClient } from '@aws-sdk/client-ssm'
import { GetCallerIdentityCommand, STS } from '@aws-sdk/client-sts'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { getIoTEndpoint } from '../aws/getIoTEndpoint.js'
import { ensureCA } from '../bridge/ensureCA.js'
import { ensureMQTTBridgeCredentials } from '../bridge/ensureMQTTBridgeCredentials.js'
import { debug } from '../cli/log.js'
import { getSettings } from '../nrfcloud/settings.js'
import { BackendApp } from './BackendApp.js'
import { packLambda } from './packLambda.js'
import { packLayer } from './packLayer.js'
import { STACK_NAME } from './stacks/stackConfig'

const ssm = new SSMClient({})
const iot = new IoTClient({})
const sts = new STS({})

export type PackedLambda = { lambdaZipFile: string; handler: string }

const packagesInLayer: string[] = [
	'@nordicsemiconductor/from-env',
	'@sinclair/typebox',
	'ajv',
]
const pack = async (id: string, handler = 'handler'): Promise<PackedLambda> => {
	try {
		await mkdir(path.join(process.cwd(), 'dist', 'lambdas'), {
			recursive: true,
		})
	} catch {
		// Directory exists
	}
	const zipFile = path.join(process.cwd(), 'dist', 'lambdas', `${id}.zip`)
	await packLambda({
		sourceFile: path.join(process.cwd(), 'lambda', `${id}.ts`),
		zipFile,
	})
	return {
		lambdaZipFile: zipFile,
		handler: `${id}.${handler}`,
	}
}

const settings = await getSettings({ ssm, stackName: STACK_NAME })()

const accountId = (await sts.send(new GetCallerIdentityCommand({})))
	.Account as string
const certsDir = path.join(process.cwd(), 'certificates', accountId)
const mqttBridgeCertificate = await ensureMQTTBridgeCredentials({
	iot,
	certsDir,
	debug: debug('MQTT bridge'),
})()
const caCertificate = await ensureCA({
	certsDir,
	iot,
	debug: debug('CA certificate'),
})()

new BackendApp({
	lambdaSources: {
		onConnect: await pack('onConnect'),
		onMessage: await pack('onMessage'),
		onDisconnect: await pack('onDisconnect'),
		publishToWebsocketClients: await pack('publishToWebsocketClients'),
		prepareDeviceShadow: await pack('prepareDeviceShadow'),
		fetchDeviceShadow: await pack('fetchDeviceShadow'),
	},
	layer: await packLayer({
		id: 'baseLayer',
		dependencies: packagesInLayer,
	}),
	settings,
	iotEndpoint: await getIoTEndpoint({ iot })(),
	mqttBridgeCertificate,
	caCertificate,
	shadowFetchingInterval: Number(process.env.SHADOW_FETCHING_INTERVAL ?? 60),
})
