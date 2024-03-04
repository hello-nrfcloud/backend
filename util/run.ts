import { spawn } from 'node:child_process'
import os from 'node:os'

export const run = async (args: {
	command: string
	args?: string[]
	input?: string
	log?: {
		debug?: (...message: any[]) => void
		stdout?: (...message: any[]) => void
		stderr?: (...message: any[]) => void
	}
}): Promise<string> =>
	new Promise((resolve, reject) => {
		args.log?.debug?.(`${args.command} ${args.args?.join(' ')}`)
		const p = spawn(args.command, args.args)
		const result = [] as string[]
		const errors = [] as string[]
		if (args.input !== undefined) {
			p.stdin.write(args.input)
		}
		p.on('close', (code) => {
			if (code !== 0) {
				return reject(
					new Error(
						`${args.command} ${args.args?.join(' ')} failed: ${errors.join(
							os.EOL,
						)}`,
					),
				)
			}
			return resolve(result.join(os.EOL))
		})
		p.stdout.on('data', (data) => {
			result.push(data)
			args.log?.stdout?.(data)
		})
		p.stderr.on('data', (data) => {
			errors.push(data)
			args.log?.stderr?.(data)
		})
	})
