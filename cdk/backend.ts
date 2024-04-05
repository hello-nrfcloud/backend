import { IAMClient } from '@aws-sdk/client-iam'
import { IoTClient } from '@aws-sdk/client-iot'
import { SSMClient } from '@aws-sdk/client-ssm'
import { STS } from '@aws-sdk/client-sts'
import { fromEnv } from '@nordicsemiconductor/from-env'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { getIoTEndpoint } from '../aws/getIoTEndpoint.js'
import { caLocation } from '../bridge/caLocation.js'
import { ensureCA } from '../bridge/ensureCA.js'
import { ensureMQTTBridgeCredentials } from '../bridge/ensureMQTTBridgeCredentials.js'
import { mqttBridgeCertificateLocation } from '../bridge/mqttBridgeCertificateLocation.js'
import { debug, type logFn } from '../cli/log.js'
import { getAllAccountsSettings } from '../nrfcloud/allAccounts.js'
import pJSON from '../package.json'
import { Scope } from '../settings/settings.js'
import { BackendApp } from './BackendApp.js'
import { ensureGitHubOIDCProvider } from '@hello.nrfcloud.com/ci/ensureGitHubOIDCProvider'
import { restoreCertificateFromSSM } from './helpers/certificates/restoreCertificateFromSSM.js'
import { storeCertificateInSSM } from './helpers/certificates/storeCertificateInSSM.js'
import { env } from './helpers/env.js'
import { pack as packBaseLayer } from './layers/baseLayer.js'
import { pack as packHealthCheckLayer } from './layers/healthCheckLayer.js'
import { packBackendLambdas } from './packBackendLambdas.js'
import { STACK_NAME } from './stacks/stackConfig.js'

const repoUrl = new URL(pJSON.repository.url)
const repository = {
	owner: repoUrl.pathname.split('/')[1] ?? 'hello-nrfcloud',
	repo: repoUrl.pathname.split('/')[2]?.replace(/\.git$/, '') ?? 'backend',
}

const iot = new IoTClient({})
const sts = new STS({})
const iam = new IAMClient({})
const ssm = new SSMClient({})

const accountEnv = await env({ sts })

const certsDir = path.join(
	process.cwd(),
	'certificates',
	`${accountEnv.account}@${accountEnv.region}`,
)
await mkdir(certsDir, { recursive: true })
const mqttBridgeCertificateFiles = mqttBridgeCertificateLocation({
	certsDir,
})
const caCertificateFiles = caLocation({
	certsDir,
})

const mqttBridgeDebug = debug('MQTT bridge')
const caDebug = debug('CA certificate')

const certificates = [
	// MQTT certificate
	[
		Scope.NRFCLOUD_BRIDGE_CERTIFICATE_MQTT,
		mqttBridgeCertificateFiles,
		mqttBridgeDebug,
	],
	// CA certificate
	[Scope.NRFCLOUD_BRIDGE_CERTIFICATE_CA, caCertificateFiles, caDebug],
] as [Scope, Record<string, string>, logFn][]

// Restore message bridge certificates from SSM
const restoredCertificates = await Promise.all(
	certificates.map(async ([scope, certsMap, debug]) =>
		restoreCertificateFromSSM({ ssm, stackName: STACK_NAME })(
			scope,
			certsMap,
			debug,
		),
	),
)

// Pick up existing, or create new certificates
const mqttBridgeCertificate = await ensureMQTTBridgeCredentials({
	iot,
	certsDir,
	debug: mqttBridgeDebug,
})()
const caCertificate = await ensureCA({
	certsDir,
	iot,
	debug: caDebug,
})()

// Store message bridge certificates in SSM
await Promise.all(
	certificates.map(async ([scope, certsMap, debug], k) => {
		if (restoredCertificates[k] === true) {
			debug(`Certificate was restored. Nothing to store.`)
			return
		}
		await storeCertificateInSSM({ ssm, stackName: STACK_NAME })(
			scope,
			certsMap,
			debug,
		)
	}),
)

// Ensure needed container images exist
const { mqttBridgeContainerTag, coapSimulatorContainerTag } = fromEnv({
	mqttBridgeContainerTag: 'MQTT_BRIDGE_CONTAINER_TAG',
	coapSimulatorContainerTag: 'COAP_SIMULATOR_CONTAINER_TAG',
})(process.env)

// Fetch all the configured nRF Cloud Accounts
const nRFCloudAccounts = await getAllAccountsSettings({
	ssm,
	stackName: STACK_NAME,
})()

new BackendApp({
	lambdaSources: await packBackendLambdas(),
	layer: await packBaseLayer(),
	healthCheckLayer: await packHealthCheckLayer(),
	iotEndpoint: await getIoTEndpoint({ iot })(),
	mqttBridgeCertificate,
	caCertificate,
	nRFCloudAccounts,
	mqttBridgeContainerTag,
	coapSimulatorContainerTag,
	repository,
	gitHubOICDProviderArn: await ensureGitHubOIDCProvider({
		iam,
	}),
	env: accountEnv,
	isTest: process.env.IS_TEST === '1',
	domain: 'hello.nrfcloud.com',
	version: (() => {
		const v = process.env.VERSION
		const defaultVersion = '0.0.0-development'
		if (v === undefined)
			console.warn(`VERSION is not defined, using ${defaultVersion}!`)
		return v ?? defaultVersion
	})(),
})
