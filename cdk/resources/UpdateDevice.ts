import { PackedLambdaFn } from '@bifravst/aws-cdk-lambda-helpers/cdk'
import {
	aws_lambda_event_sources as EventSources,
	aws_iam as IAM,
	aws_lambda as Lambda,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import type { BackendLambdas } from '../packBackendLambdas.js'
import type { DeviceStorage } from './DeviceStorage.js'

/**
 * Handles device updates
 */
export class UpdateDevice extends Construct {
	public readonly hideDataBeforeFn: PackedLambdaFn
	public readonly onHideDataFn: PackedLambdaFn
	public constructor(
		parent: Construct,
		{
			lambdaSources,
			layers,
			deviceStorage,
		}: {
			lambdaSources: Pick<BackendLambdas, 'hideDataBefore' | 'onHideData'>
			layers: Lambda.ILayerVersion[]
			deviceStorage: DeviceStorage
		},
	) {
		super(parent, 'UpdateDevice')

		this.hideDataBeforeFn = new PackedLambdaFn(
			this,
			'hideDataBefore',
			lambdaSources.hideDataBefore,
			{
				description: 'Handles device updates',
				environment: {
					DEVICES_TABLE_NAME: deviceStorage.devicesTable.tableName,
				},
				layers,
			},
		)
		deviceStorage.devicesTable.grantReadWriteData(this.hideDataBeforeFn.fn)

		this.onHideDataFn = new PackedLambdaFn(
			this,
			'onHideData',
			lambdaSources.onHideData,
			{
				description: 'Processes the request to hide device data',
				layers,
				initialPolicy: [
					new IAM.PolicyStatement({
						actions: ['iot:DeleteThingShadow'],
						resources: ['*'],
					}),
				],
			},
		)

		this.onHideDataFn.fn.addEventSource(
			new EventSources.DynamoEventSource(deviceStorage.devicesTable, {
				startingPosition: Lambda.StartingPosition.LATEST,
				filters: [
					Lambda.FilterCriteria.filter({
						dynamodb: {
							NewImage: {
								deviceId: {
									S: [{ exists: true }],
								},
								hideDataBefore: {
									S: [{ exists: true }],
								},
							},
							OldImage: [{ exists: true }],
						},
					}),
				],
			}),
		)
	}
}
