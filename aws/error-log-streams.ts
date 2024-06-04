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
import { mkdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'

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

const logDir = path.join(process.cwd(), 'logs')
try {
	await stat(logDir)
} catch {
	await mkdir(logDir)
}

const list = getLogEventsWithErrors(logs)
for (const logGroup of logGroups) {
	console.log(chalk.yellow(logGroup.PhysicalResourceId))
	const logs = await list(logGroup.PhysicalResourceId)

	const logStreamFile = path.parse(
		path.join(logDir, `${logGroup.PhysicalResourceId}.log`),
	)
	await mkdir(logStreamFile.dir, { recursive: true })
	await writeFile(
		path.join(logDir, `${logGroup.PhysicalResourceId}.log`),
		logs
			.map((l) => l.message)
			.map((m) => m?.trim())
			.join('\n'),
		'utf-8',
	)
}
