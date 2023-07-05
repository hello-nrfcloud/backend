import {
	Duration,
	aws_events_targets as EventTargets,
	aws_events as Events,
	aws_lambda as Lambda,
	aws_logs as Logs,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import type { BackendLambdas } from '../../BackendLambdas.js'
import type { DeviceLastSeen } from '../DeviceLastSeen.js'
import { LambdaSource } from '../LambdaSource.js'

export class KPIs extends Construct {
	constructor(
		parent: Construct,
		{
			lastSeen,
			lambdaSources,
			layers,
		}: {
			lastSeen: DeviceLastSeen
			lambdaSources: BackendLambdas
			layers: Lambda.ILayerVersion[]
		},
	) {
		super(parent, 'kpis')

		const lambda = new Lambda.Function(this, 'lambda', {
			handler: lambdaSources.kpis.handler,
			architecture: Lambda.Architecture.ARM_64,
			runtime: Lambda.Runtime.NODEJS_18_X,
			timeout: Duration.seconds(5),
			memorySize: 1792,
			code: new LambdaSource(this, lambdaSources.kpis).code,
			description: 'Collect KPIs and publish them as metrics',
			environment: {
				VERSION: this.node.tryGetContext('version'),
				LOG_LEVEL: this.node.tryGetContext('logLevel'),
				NODE_NO_WARNINGS: '1',
				DISABLE_METRICS: this.node.tryGetContext('isTest') === true ? '1' : '0',
				LAST_SEEN_TABLE_NAME: lastSeen.table.tableName,
			},
			layers,
			logRetention: Logs.RetentionDays.ONE_WEEK,
		})
		lastSeen.table.grantReadData(lambda)

		const rule = new Events.Rule(this, 'rule', {
			description: `Rule to schedule KPI lambda invocations`,
			schedule: Events.Schedule.rate(Duration.hours(1)),
		})
		rule.addTarget(new EventTargets.LambdaFunction(lambda))
	}
}
