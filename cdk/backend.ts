import { ACMClient } from '@aws-sdk/client-acm'
import { IAMClient } from '@aws-sdk/client-iam'
import { IoTClient } from '@aws-sdk/client-iot'
import { SSMClient } from '@aws-sdk/client-ssm'
import { STS } from '@aws-sdk/client-sts'
import { ensureGitHubOIDCProvider } from '@bifravst/ci'
import { fromEnv } from '@bifravst/from-env'
import { getAllAccounts } from '@hello.nrfcloud.com/nrfcloud-api-helpers/settings'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { getCertificateForDomain } from '../aws/acm.js'
import { env } from '../aws/env.js'
import { getIoTEndpoint } from '../aws/getIoTEndpoint.js'
import { caLocation } from '../bridge/caLocation.js'
import { ensureCA } from '../bridge/ensureCA.js'
import { ensureMQTTBridgeCredentials } from '../bridge/ensureMQTTBridgeCredentials.js'
import { mqttBridgeCertificateLocation } from '../bridge/mqttBridgeCertificateLocation.js'
import { debug, type logFn } from '../cli/log.js'
import pJSON from '../package.json'
import { ScopeContexts, type ScopeContext } from '../settings/scope.js'
import { BackendApp } from './BackendApp.js'
import { restoreCertificateFromSSM } from './helpers/certificates/restoreCertificateFromSSM.js'
import { storeCertificateInSSM } from './helpers/certificates/storeCertificateInSSM.js'
import { pack as packBaseLayer } from './layers/baseLayer.js'
import { pack as packCDKLayer } from './layers/cdkLayer.js'
import { pack as packHealthCheckLayer } from './layers/healthCheckLayer.js'
import { pack as packJWTLayer } from './layers/jwtLayer.js'
import { packBackendLambdas } from './packBackendLambdas.js'
import { STACK_NAME } from './stackConfig.js'

const repoUrl = new URL(pJSON.repository.url)
const repository = {
	owner: repoUrl.pathname.split('/')[1] ?? 'hello-nrfcloud',
	repo: repoUrl.pathname.split('/')[2]?.replace(/\.git$/, '') ?? 'backend',
}

const iot = new IoTClient({})
const sts = new STS({})
const iam = new IAMClient({})
const ssm = new SSMClient({})
const acm = new ACMClient({})

const accountEnv = await env({ sts })

const certsDir = path.join(
	process.cwd(),
	'certificates',
	`${accountEnv.account}@${accountEnv.region}`,
	STACK_NAME,
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
		ScopeContexts.NRFCLOUD_BRIDGE_CERTIFICATE_MQTT,
		mqttBridgeCertificateFiles,
		mqttBridgeDebug,
	],
	// CA certificate
	[ScopeContexts.NRFCLOUD_BRIDGE_CERTIFICATE_CA, caCertificateFiles, caDebug],
] as [ScopeContext, Record<string, string>, logFn][]

// Restore message bridge certificates from SSM
const restoredCertificates = await Promise.all(
	certificates.map(async ([scopeContext, certsMap, debug]) =>
		restoreCertificateFromSSM({ ssm, stackName: STACK_NAME })(
			scopeContext,
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
const { mqttBridgeContainerTag } = fromEnv({
	mqttBridgeContainerTag: 'MQTT_BRIDGE_CONTAINER_TAG',
})(process.env)

// Fetch all the configured nRF Cloud Accounts
const nRFCloudAccounts = await getAllAccounts({
	ssm,
	stackName: STACK_NAME,
})

const isTest = process.env.IS_TEST === '1'
const apiDomainName = process.env.API_DOMAIN_NAME
const apiDomainRoute53RoleArn = process.env.API_DOMAIN_ROUTE_53_ROLE_ARN

new BackendApp({
	lambdaSources: await packBackendLambdas(),
	baseLayer: await packBaseLayer(),
	healthCheckLayer: await packHealthCheckLayer(),
	cdkLayer: await packCDKLayer(),
	jwtLayer: await packJWTLayer(),
	iotEndpoint: await getIoTEndpoint({ iot }),
	mqttBridgeCertificate,
	caCertificate,
	nRFCloudAccounts,
	mqttBridgeContainerTag,
	repository,
	gitHubOICDProviderArn: await ensureGitHubOIDCProvider({
		iam,
	}),
	env: accountEnv,
	isTest,
	apiDomain:
		apiDomainName !== undefined && apiDomainRoute53RoleArn !== undefined
			? {
					domainName: apiDomainName,
					certificateArn:
						(await getCertificateForDomain(acm)(apiDomainName))
							.certificateArn ?? '',
					roleArn: apiDomainRoute53RoleArn,
				}
			: undefined,
	version: (() => {
		const v = process.env.VERSION
		const defaultVersion = '0.0.0-development'
		if (v === undefined)
			console.warn(`VERSION is not defined, using ${defaultVersion}!`)
		return v ?? defaultVersion
	})(),
})
