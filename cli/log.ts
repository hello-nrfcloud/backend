import chalk from 'chalk'

export type logFn = (...args: any[]) => void

export const debug =
	(id: string): logFn =>
	(...args: any[]) =>
		console.debug(
			chalk.gray.dim(`[${id}]`),
			...args.map((arg) => chalk.blue.dim(arg)),
		)
