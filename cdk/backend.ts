import { ECRClient } from '@aws-sdk/client-ecr'
import { IAMClient } from '@aws-sdk/client-iam'
import { IoTClient } from '@aws-sdk/client-iot'
import { STS } from '@aws-sdk/client-sts'
import { SSMClient } from '@aws-sdk/client-ssm'
import path from 'node:path'
import { getIoTEndpoint } from '../aws/getIoTEndpoint.js'
import { getOrBuildDockerImage } from '../aws/getOrBuildDockerImage.js'
import { getOrCreateRepository } from '../aws/getOrCreateRepository.js'
import { ensureCA } from '../bridge/ensureCA.js'
import { ensureMQTTBridgeCredentials } from '../bridge/ensureMQTTBridgeCredentials.js'
import { debug, type logFn } from '../cli/log.js'
import pJSON from '../package.json'
import { BackendApp } from './BackendApp.js'
import { ensureGitHubOIDCProvider } from './ensureGitHubOIDCProvider.js'
import { env } from './helpers/env.js'
import { packLayer } from './helpers/lambdas/packLayer.js'
import { packBackendLambdas } from './packBackendLambdas.js'
import {
	ECR_NAME,
	STACK_NAME,
	ECR_NAME_COAP_SIMULATOR,
} from './stacks/stackConfig.js'
import { mkdir } from 'node:fs/promises'
import { Scope } from '../util/settings.js'
import { mqttBridgeCertificateLocation } from '../bridge/mqttBridgeCertificateLocation.js'
import { caLocation } from '../bridge/caLocation.js'
import { restoreCertificateFromSSM } from './helpers/certificates/restoreCertificateFromSSM.js'
import { storeCertificateInSSM } from './helpers/certificates/storeCertificateInSSM.js'
import { getAllAccountsSettings } from '../nrfcloud/allAccounts.js'
import { getMosquittoLatestTag } from '../docker/getMosquittoLatestTag.js'
import { hashFolder } from '../docker/hashFolder.js'

const repoUrl = new URL(pJSON.repository.url)
const repository = {
	owner: repoUrl.pathname.split('/')[1] ?? 'hello-nrfcloud',
	repo: repoUrl.pathname.split('/')[2]?.replace(/\.git$/, '') ?? 'backend',
}

const iot = new IoTClient({})
const sts = new STS({})
const ecr = new ECRClient({})
const iam = new IAMClient({})
const ssm = new SSMClient({})

const accountEnv = await env({ sts })

const packagesInLayer: string[] = [
	'@nordicsemiconductor/from-env',
	'@nordicsemiconductor/timestream-helpers',
	'@sinclair/typebox',
	'ajv',
	'@hello.nrfcloud.com/proto',
	'p-limit',
	'@aws-lambda-powertools/metrics',
	'lodash-es',
	'@middy/core',
]

const healthCheckPackagesInLayer: string[] = ['mqtt', 'ws']

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

// Prebuild / reuse docker image
// NOTE: It is intention that release image tag can be undefined during the development,
// then the system will create image based on the folder hash
const releaseImageTag = process.env.RELEASE_IMAGE_TAG
const repositoryUri = await getOrCreateRepository({ ecr })(ECR_NAME)
const mosquittoLatestTag = await getMosquittoLatestTag()
const bridgeDockerfilePath = path.join(
	process.cwd(),
	'cdk',
	'resources',
	'containers',
	'bridge',
)
const bridgeHash = await hashFolder(bridgeDockerfilePath)
const { imageTag } = await getOrBuildDockerImage({
	ecr,
	releaseImageTag,
	debug: debug('Docker image'),
})({
	repositoryUri,
	repositoryName: ECR_NAME,
	dockerFilePath: bridgeDockerfilePath,
	imageTagFactory: async () => `${bridgeHash}_${mosquittoLatestTag}`,
	buildArgs: {
		MOSQUITTO_VERSION: mosquittoLatestTag,
	},
})
// Prebuild / reuse coap-simulator docker image
if (process.env.COAP_SIMULATOR_DOWNLOAD_URL === undefined) {
	throw new Error(`CoAP simulator download url is not configured`)
}
const repositoryCoapSimulatorUri = await getOrCreateRepository({ ecr })(
	ECR_NAME_COAP_SIMULATOR,
)
const coapDockerfilePath = path.join(
	process.cwd(),
	'cdk',
	'resources',
	'containers',
	'coap',
)
const coapHash = await hashFolder(coapDockerfilePath)
const { imageTag: coapSimulatorImageTag } = await getOrBuildDockerImage({
	ecr,
	releaseImageTag: undefined,
	debug: debug('CoAP simulator docker image'),
})({
	repositoryUri: repositoryCoapSimulatorUri,
	repositoryName: ECR_NAME_COAP_SIMULATOR,
	dockerFilePath: coapDockerfilePath,
	imageTagFactory: async () => `${coapHash}`,
	buildArgs: {
		COAP_SIMULATOR_DOWNLOAD_URL: process.env.COAP_SIMULATOR_DOWNLOAD_URL,
	},
})

const nRFCloudAccounts = await getAllAccountsSettings({
	ssm,
	stackName: STACK_NAME,
})()

new BackendApp({
	lambdaSources: await packBackendLambdas(),
	layer: await packLayer({
		id: 'baseLayer',
		dependencies: packagesInLayer,
	}),
	healthCheckLayer: await packLayer({
		id: 'healthCheckLayer',
		dependencies: healthCheckPackagesInLayer,
	}),
	iotEndpoint: await getIoTEndpoint({ iot })(),
	mqttBridgeCertificate,
	caCertificate,
	nRFCloudAccounts,
	bridgeImageSettings: {
		imageTag,
		repositoryUri,
	},
	coapSimulatorImage: {
		imageTag: coapSimulatorImageTag,
		repositoryName: ECR_NAME_COAP_SIMULATOR,
	},
	repository,
	gitHubOICDProviderArn: await ensureGitHubOIDCProvider({
		iam,
	}),
	env: accountEnv,
	isTest: process.env.IS_TEST === '1',
})
