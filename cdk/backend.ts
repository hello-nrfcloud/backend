import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { BackendApp } from './BackendApp.js'
import { packLambda } from './packLambda.js'
import { packLayer } from './packLayer.js'
import {
	IOT_CERT_PARAM,
	IOT_KEY_PARAM,
	NRFCLOUD_ACCOUNT_INFO_PARAM,
	NRFCLOUD_CLIENT_CERT_PARAM,
	NRFCLOUD_CLIENT_KEY_PARAM,
} from './stacks/stackConfig'

export type PackedLambda = { lambdaZipFile: string; handler: string }
export type MqttConfiguration = {
	SSMParams: {
		iot: {
			cert: string
			key: string
		}
		nrfcloud: {
			cert: string
			key: string
		}
	}
	accountInfo: {
		mqttEndpoint: string
		mqttTopicPrefix: string
		tenantId: string
		accountDeviceClientId: string
	}
}

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

const getMqttConfiguration = async (): Promise<MqttConfiguration> => {
	const ssm = new SSMClient({})

	const nrfcloudAccountInfo = await ssm.send(
		new GetParameterCommand({
			Name: NRFCLOUD_ACCOUNT_INFO_PARAM,
		}),
	)
	return {
		SSMParams: {
			iot: {
				cert: IOT_CERT_PARAM,
				key: IOT_KEY_PARAM,
			},
			nrfcloud: {
				cert: NRFCLOUD_CLIENT_CERT_PARAM,
				key: NRFCLOUD_CLIENT_KEY_PARAM,
			},
		},
		accountInfo: JSON.parse(nrfcloudAccountInfo?.Parameter?.Value ?? '{}'),
	}
}

new BackendApp({
	lambdaSources: {
		onConnect: await pack('onConnect'),
		onMessage: await pack('onMessage'),
		onDisconnect: await pack('onDisconnect'),
		publishToWebsocketClients: await pack('publishToWebsocketClients'),
	},
	layer: await packLayer({
		id: 'baseLayer',
		dependencies: packagesInLayer,
	}),
	mqttConfiguration: await getMqttConfiguration(),
})
