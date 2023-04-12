import { IoTClient } from '@aws-sdk/client-iot'
import { SSMClient } from '@aws-sdk/client-ssm'
import { GetCallerIdentityCommand, STS } from '@aws-sdk/client-sts'
import path from 'node:path'
import { getIoTEndpoint } from '../aws/getIoTEndpoint.js'
import { ensureCA } from '../bridge/ensureCA.js'
import { ensureMQTTBridgeCredentials } from '../bridge/ensureMQTTBridgeCredentials.js'
import { debug } from '../cli/log.js'
import { getSettings } from '../nrfcloud/settings.js'
import { BackendApp } from './BackendApp.js'
import { packLayer } from './helpers/lambdas/packLayer.js'
import { packBackendLambdas } from './packBackendLambdas.js'
import { STACK_NAME } from './stacks/stackConfig'

const ssm = new SSMClient({})
const iot = new IoTClient({})
const sts = new STS({})

const packagesInLayer: string[] = [
	'@nordicsemiconductor/from-env',
	'@sinclair/typebox',
	'ajv',
]
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
	lambdaSources: await packBackendLambdas(),
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
