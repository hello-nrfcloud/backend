import { App } from 'aws-cdk-lib'
import { type CAFiles } from '../bridge/caLocation.js'
import type { CertificateFiles } from '../bridge/mqttBridgeCertificateLocation'
import type { Settings } from '../nrfcloud/settings'
import type { BackendLambdas } from './BackendLambdas.js'
import type { PackedLayer } from './helpers/lambdas/packLayer'
import type { BridgeImageSettings } from './resources/Integration.js'
import { BackendStack } from './stacks/BackendStack.js'

export class BackendApp extends App {
	public constructor({
		lambdaSources,
		layer,
		iotEndpoint,
		mqttBridgeCertificate,
		caCertificate,
		bridgeImageSettings,
	}: {
		lambdaSources: BackendLambdas
		layer: PackedLayer
		settings: Settings
		iotEndpoint: string
		mqttBridgeCertificate: CertificateFiles
		caCertificate: CAFiles
		bridgeImageSettings: BridgeImageSettings
	}) {
		super()

		new BackendStack(this, {
			lambdaSources,
			layer,
			iotEndpoint,
			mqttBridgeCertificate,
			caCertificate,
			bridgeImageSettings,
		})
	}
}
