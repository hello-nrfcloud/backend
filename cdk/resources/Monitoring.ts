import type { aws_logs as Logs } from 'aws-cdk-lib'
import { QueryDefinition, QueryString } from 'aws-cdk-lib/aws-logs'
import { Construct } from 'constructs'

/**
 * Collects monitoring resources
 */
export class Monitoring extends Construct {
	public constructor(
		parent: Construct,
		{ logGroups }: { logGroups: Array<Logs.ILogGroup> },
	) {
		super(parent, 'Monitoring')

		// Get all error logs from all lambda errors
		new QueryDefinition(this, 'ErrorLogsQuery', {
			queryDefinitionName: 'Lambda errors',
			queryString: new QueryString({
				fields: ['@timestamp', '@message', '@logStream', '@log'],
				sort: '@timestamp desc',
				filterStatements: [`@message LIKE 'ERROR'`],
				limit: 100,
			}),
			logGroups,
		})
	}
}
