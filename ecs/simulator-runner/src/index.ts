import yargs from 'yargs/yargs'
import { simulate } from './commands/simulate'
;(async function runner() {
	await yargs(process.argv.splice(2))
		.command(
			'simulate',
			`Simulate devices's activities`,
			{
				region: {
					alias: 'r',
					type: 'string',
					desc: 'AWS region',
				},
				'aws-access-key': {
					type: 'string',
					desc: 'AWS access key id',
				},
				'aws-secret-key': {
					type: 'string',
					desc: 'AWS secret access key id',
				},
				table: {
					alias: 't',
					type: 'string',
					desc: 'DynamoDB table name to be extracted',
					demandOption: true,
				},
				number: {
					alias: 'n',
					type: 'number',
					desc: 'Number of simulator devices',
					default: 10,
				},
				duration: {
					alias: 'd',
					type: 'number',
					desc: 'Simulator duration in seconds',
					default: 60,
				},
			},
			simulate,
		)
		.demandCommand(1)
		.help().argv
})().catch(console.error)
