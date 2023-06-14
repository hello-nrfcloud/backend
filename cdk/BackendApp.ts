import { App } from 'aws-cdk-lib'
import { type CAFiles } from '../bridge/caLocation.js'
import type { CertificateFiles } from '../bridge/mqttBridgeCertificateLocation'
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
		region,
	}: {
		lambdaSources: BackendLambdas
		layer: PackedLayer
		iotEndpoint: string
		mqttBridgeCertificate: CertificateFiles
		caCertificate: CAFiles
		bridgeImageSettings: BridgeImageSettings
		region: string
	}) {
		super()

		new BackendStack(this, {
			lambdaSources,
			layer,
			iotEndpoint,
			mqttBridgeCertificate,
			caCertificate,
			bridgeImageSettings,
			region,
		})
	}
}
