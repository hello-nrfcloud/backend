import {
	Duration,
	aws_events_targets as EventTargets,
	aws_events as Events,
	aws_lambda as Lambda,
	aws_iam as IAM,
	Stack,
} from 'aws-cdk-lib'
import { Construct } from 'constructs'
import type { BackendLambdas } from '../../BackendLambdas.js'
import type { DeviceLastSeen } from '../DeviceLastSeen.js'
import type { DeviceStorage } from '../DeviceStorage.js'
import { LambdaSource } from '../LambdaSource.js'
import { Scope } from '../../../util/settings.js'
import { LambdaLogGroup } from '../LambdaLogGroup.js'

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

		const lambda = new Lambda.Function(this, 'lambda', {
			handler: lambdaSources.kpis.handler,
			architecture: Lambda.Architecture.ARM_64,
			runtime: Lambda.Runtime.NODEJS_20_X,
			timeout: Duration.seconds(10),
			memorySize: 1792,
			code: new LambdaSource(this, lambdaSources.kpis).code,
			description: 'Collect KPIs and publish them as metrics',
			environment: {
				VERSION: this.node.tryGetContext('version'),
				LOG_LEVEL: this.node.tryGetContext('logLevel'),
				NODE_NO_WARNINGS: '1',
				DISABLE_METRICS: this.node.tryGetContext('isTest') === true ? '1' : '0',
				LAST_SEEN_TABLE_NAME: lastSeen.table.tableName,
				DEVICES_TABLE_NAME: deviceStorage.devicesTable.tableName,
				STACK_NAME: Stack.of(this).stackName,
			},
			initialPolicy: [
				new IAM.PolicyStatement({
					actions: ['ssm:GetParametersByPath', 'ssm:GetParameter'],
					resources: [
						`arn:aws:ssm:${Stack.of(this).region}:${
							Stack.of(this).account
						}:parameter/${Stack.of(this).stackName}/${
							Scope.NRFCLOUD_ACCOUNT_PREFIX
						}`,
						`arn:aws:ssm:${Stack.of(this).region}:${
							Stack.of(this).account
						}:parameter/${Stack.of(this).stackName}/${
							Scope.NRFCLOUD_ACCOUNT_PREFIX
						}/*`,
						`arn:aws:ssm:${Stack.of(this).region}:${
							Stack.of(this).account
						}:parameter/${Stack.of(this).stackName}/nRFCloud/accounts`,
						`arn:aws:ssm:${Stack.of(this).region}:${
							Stack.of(this).account
						}:parameter/${Stack.of(this).stackName}/nRFCloud/accounts/*`,
					],
				}),
			],
			layers,
			...new LambdaLogGroup(this, 'lambdaLogs'),
		})
		lastSeen.table.grantReadData(lambda)
		deviceStorage.devicesTable.grantReadData(lambda)

		const rule = new Events.Rule(this, 'rule', {
			description: `Rule to schedule KPI lambda invocations`,
			schedule: Events.Schedule.rate(Duration.hours(1)),
		})
		rule.addTarget(new EventTargets.LambdaFunction(lambda))
	}
}
