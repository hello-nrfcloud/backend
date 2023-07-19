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
import { ECR_NAME, STACK_NAME } from './stacks/stackConfig.js'
import { mkdir } from 'node:fs/promises'
import { Scope, getSettingsOptional, putSettings } from '../util/settings.js'
import { readFilesFromMap } from './helpers/readFilesFromMap.js'
import { writeFilesFromMap } from './helpers/writeFilesFromMap.js'
import { mqttBridgeCertificateLocation } from '../bridge/mqttBridgeCertificateLocation.js'
import { caLocation } from '../bridge/caLocation.js'

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
const restoredCertificates = await Promise.all<boolean>(
	certificates.map(async ([scope, certsMap, debug]) => {
		debug(`Getting settings`, scope)
		const settings = await getSettingsOptional<Record<string, string>, null>({
			ssm,
			stackName: STACK_NAME,
			scope,
		})(null)
		if (settings === null) {
			debug(`No certificate in settings.`)
			return false
		}

		debug(`Restoring`)
		const locations: Record<string, string> = Object.entries(settings).reduce(
			(locations, [k, v]) => {
				const path = certsMap[k]
				debug(`Unrecognized path:`, k)
				if (path === undefined) return locations
				return {
					...locations,
					[path]: v,
				}
			},
			{},
		)
		// Make sure all required locations exist

		for (const k of Object.keys(certsMap)) {
			if (locations[k] === undefined) {
				debug(`Restored certificate settings are missing key`, k)
				return false
			}
		}
		for (const k of Object.keys(locations)) debug(`Restoring:`, k)
		await writeFilesFromMap(settings)
		return true
	}),
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
		for (const k of Object.keys(certsMap)) debug(`Storing:`, k)
		Object.entries(readFilesFromMap(certsMap)).map(async ([k, v]) =>
			putSettings({
				ssm,
				stackName: STACK_NAME,
				scope,
			})({
				property: k,
				value: v,
			}),
		)
	}),
)

// Prebuild / reuse docker image
// NOTE: It is intention that release image tag can be undefined during the development,
// then the system will create image based on the folder hash
const releaseImageTag = process.env.RELEASE_IMAGE_TAG
const repositoryUri = await getOrCreateRepository({ ecr })(ECR_NAME)
const { imageTag } = await getOrBuildDockerImage({
	ecr,
	releaseImageTag,
	debug: debug('Docker image'),
})({
	repositoryUri,
	repositoryName: ECR_NAME,
	dockerFilePath: path.join(
		process.cwd(),
		'cdk',
		'resources',
		'containers',
		'bridge',
	),
})

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
	bridgeImageSettings: {
		imageTag,
		repositoryUri,
	},
	repository,
	gitHubOICDProviderArn: await ensureGitHubOIDCProvider({
		iam,
	}),
	env: accountEnv,
	isTest: process.env.IS_TEST === '1',
})
