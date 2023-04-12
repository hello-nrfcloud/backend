import { App } from 'aws-cdk-lib'
import { type CAFiles } from '../bridge/caLocation'
import type { CertificateFiles } from '../bridge/mqttBridgeCertificateLocation'
import type { Settings } from '../nrfcloud/settings'
import type { BackendLambdas } from './BackendLambdas.js'
import type { PackedLayer } from './helpers/lambdas/packLayer'
import { BackendStack } from './stacks/BackendStack.js'

export class BackendApp extends App {
	public constructor({
		lambdaSources,
		layer,
		iotEndpoint,
		mqttBridgeCertificate,
		caCertificate,
		shadowFetchingInterval,
	}: {
		lambdaSources: BackendLambdas
		layer: PackedLayer
		settings: Settings
		iotEndpoint: string
		mqttBridgeCertificate: CertificateFiles
		caCertificate: CAFiles
		shadowFetchingInterval: number
	}) {
		super()

		new BackendStack(this, {
			lambdaSources,
			layer,
			iotEndpoint,
			mqttBridgeCertificate,
			caCertificate,
			shadowFetchingInterval,
		})
	}
}
