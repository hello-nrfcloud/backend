import {
	CloudFormationClient,
	DescribeStackResourcesCommand,
} from '@aws-sdk/client-cloudformation'
import {
	CloudWatchLogsClient,
	DeleteLogGroupCommand,
	DescribeLogStreamsCommand,
	GetLogEventsCommand,
} from '@aws-sdk/client-cloudwatch-logs'
import chalk from 'chalk'
import type { CommandDefinition } from './CommandDefinition.js'

export const logsCommand = ({
	stackName,
	cf,
	logs,
}: {
	stackName: string
	cf: CloudFormationClient
	logs: CloudWatchLogsClient
}): CommandDefinition => ({
	command: 'logs',
	options: [
		{
			flags: '-n, --numLogGroups <numLogGroups>',
			description: 'Number of logGroups to consider, default: 1',
		},
		{
			flags: '-s, --numLogStreams <numLogStreams>',
			description: 'Number of logStreams to consider, default: 100',
		},
		{
			flags: '-f, --filter <filter>',
			description: 'string to filter for',
		},
		{
			flags: '-X, --deleteLogGroups',
			description: 'delete log groups afterwards',
		},
		{
			flags: '-a, --age',
			description: 'age of logs in minutes (defaults to 5 minutes)',
		},
	],
	action: async ({
		numLogGroups,
		numLogStreams,
		filter,
		deleteLogGroups,
		age,
	}) => {
		const logGroups =
			(
				await cf.send(
					new DescribeStackResourcesCommand({ StackName: stackName }),
				)
			).StackResources?.filter(({ ResourceType }) =>
				['AWS::Logs::LogGroup', 'Custom::LogRetention'].includes(
					ResourceType ?? '',
				),
			)?.map(({ PhysicalResourceId }) => PhysicalResourceId as string) ??
			([] as string[])

		if (deleteLogGroups === true) {
			await Promise.all(
				logGroups.map(async (logGroupName) => {
					console.log(
						chalk.gray(`Deleting log group`),
						chalk.yellow(logGroupName),
					)
					try {
						await logs.send(
							new DeleteLogGroupCommand({
								logGroupName,
							}),
						)
						console.log(
							chalk.green(`Deleting log group`),
							chalk.yellow(logGroupName),
						)
					} catch {
						console.debug(
							chalk.redBright(`Deleting log group failed.`),
							chalk.yellow(logGroupName),
						)
					}
				}),
			)
			return
		}

		const streams = await Promise.all(
			logGroups.map(async (logGroupName) => {
				const { logStreams } = await logs.send(
					new DescribeLogStreamsCommand({
						logGroupName,
						orderBy: 'LastEventTime',
						descending: true,
						limit: numLogGroups !== undefined ? parseInt(numLogGroups, 10) : 1,
					}),
				)

				return {
					logGroupName,
					logStreams:
						logStreams?.map(({ logStreamName }) => logStreamName as string) ??
						[],
				}
			}),
		)

		await Promise.all(
			streams.map(async ({ logGroupName, logStreams }) => {
				const l = await Promise.all(
					logStreams.map(async (logStreamName) =>
						logs.send(
							new GetLogEventsCommand({
								logGroupName,
								logStreamName,
								startFromHead: false,
								limit:
									numLogStreams !== undefined
										? parseInt(numLogStreams, 10)
										: 100,
								endTime: Date.now(),
								startTime: Date.now() - parseInt(age ?? '5', 10) * 60 * 1000,
							}),
						),
					),
				)
				console.log(chalk.yellow(logGroupName))
				l.forEach((x) => {
					x.events
						?.filter(
							({ message }) =>
								!/^(START|END|REPORT) RequestId:/.test(message ?? ''),
						)
						?.filter(({ message }) =>
							filter === undefined ? true : message?.includes(filter),
						)
						?.forEach((e) => {
							try {
								const parts = (e.message?.trim() ?? '').split('\t')
								const message = parts.pop()
								const prettified = JSON.stringify(
									JSON.parse(message ?? ''),
									null,
									2,
								)
								console.log(chalk.gray(parts.join('\t')))
								console.log(prettified)
							} catch {
								console.log(chalk.gray(e.message?.trim()))
							}
						})
				})
			}),
		)
	},
	help: 'Query log files',
})
