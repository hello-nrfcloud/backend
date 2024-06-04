import { CloudFormation } from '@aws-sdk/client-cloudformation'
import {
	CloudWatchLogsClient,
	DescribeLogStreamsCommand,
	FilterLogEventsCommand,
	type FilteredLogEvent,
} from '@aws-sdk/client-cloudwatch-logs'
import { STACK_NAME } from '../cdk/stackConfig.js'
import { listStackResources } from '@nordicsemiconductor/cloudformation-helpers'
import chalk from 'chalk'

export const getLogEventsWithErrors =
	(cloudWatchLogs: CloudWatchLogsClient) =>
	async (logGroupName: string): Promise<FilteredLogEvent[]> => {
		// Get the log streams within the log group
		const logStreamsResponse = await cloudWatchLogs.send(
			new DescribeLogStreamsCommand({
				logGroupName,
				descending: true,
				orderBy: 'LastEventTime',
				limit: 10,
			}),
		)

		const logStreams = logStreamsResponse.logStreams ?? []

		// Iterate over each log stream
		const logEntries: FilteredLogEvent[] = []
		for (const logStream of logStreams) {
			// Get the log events within the log stream
			const logEventsWithError = await cloudWatchLogs.send(
				new FilterLogEventsCommand({
					logGroupName,
					logStreamNames: [logStream.logStreamName as string],
					filterPattern: 'ERROR',
				}),
			)

			if ((logEventsWithError.events ?? []).length > 0) {
				const allLogEvents = await cloudWatchLogs.send(
					new FilterLogEventsCommand({
						logGroupName,
						logStreamNames: [logStream.logStreamName as string],
					}),
				)
				const logEvents = allLogEvents.events ?? []
				if (logEvents.length > 0) {
					// Add the log events to the result array
					logEntries.push(...logEvents)
				}
			}
		}

		return logEntries
	}

const cf = new CloudFormation({})
const logs = new CloudWatchLogsClient({})
const stackName = STACK_NAME
const logGroups = await listStackResources(cf, stackName, [
	'AWS::Logs::LogGroup',
	'Custom::LogRetention',
])

const list = getLogEventsWithErrors(logs)
for (const logGroup of logGroups) {
	console.log(chalk.yellow(logGroup.PhysicalResourceId))
	for (const log of await list(logGroup.PhysicalResourceId)) {
		console.log(log.message)
	}
}
