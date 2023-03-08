import yargs from 'yargs'
import { hideBin } from 'yargs/helpers'

import { cleanup } from './commands/cleanup.js'
import { mock } from './commands/mock.js'

export type CommandGlobalOptions = {
	apiKey: string
}

await yargs(hideBin(process.argv))
	.usage('$0 <command> [options]')
	.command('mock', 'Mock nRF Cloud infrastructure', mock)
	.command('cleanup', 'Clean up nRF Cloud infrastructure', cleanup)
	.demandCommand(1)
	.help().argv
