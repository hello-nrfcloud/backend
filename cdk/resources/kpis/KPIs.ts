import { PackedLambdaFn } from '@bifravst/aws-cdk-lambda-helpers/cdk'
import type { aws_lambda as Lambda } from 'aws-cdk-lib'
import {
	Duration,
	aws_events_targets as EventTargets,
	aws_events as Events,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import type { BackendLambdas } from '../../packBackendLambdas.js'
import type { DeviceLastSeen } from '../DeviceLastSeen.js'
import type { DeviceStorage } from '../DeviceStorage.js'

export class KPIs extends Construct {
	constructor(
		parent: Construct,
		{
			lastSeen,
			lambdaSources,
			layers,
			deviceStorage,
		}: {
			lastSeen: DeviceLastSeen
			deviceStorage: DeviceStorage
			lambdaSources: BackendLambdas
			layers: Lambda.ILayerVersion[]
		},
	) {
		super(parent, 'kpis')

		const lambda = new PackedLambdaFn(this, 'lambda', lambdaSources.kpis, {
			timeout: Duration.seconds(10),
			description: 'Collect KPIs and publish them as metrics',
			environment: {
				LAST_SEEN_TABLE_NAME: lastSeen.table.tableName,
				DEVICES_TABLE_NAME: deviceStorage.devicesTable.tableName,
			},
			layers,
		}).fn
		lastSeen.table.grantReadData(lambda)
		deviceStorage.devicesTable.grantReadData(lambda)

		const rule = new Events.Rule(this, 'rule', {
			description: `Rule to schedule KPI lambda invocations`,
			schedule: Events.Schedule.rate(Duration.hours(1)),
		})
		rule.addTarget(new EventTargets.LambdaFunction(lambda))
	}
}
