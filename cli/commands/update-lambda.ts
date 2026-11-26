import type { CloudFormationClient } from '@aws-sdk/client-cloudformation'
import type { LambdaClient } from '@aws-sdk/client-lambda'
import type { PackedLambda } from '@bifravst/aws-cdk-lambda-helpers'
import { updateLambdaCode } from '@bifravst/aws-cdk-lambda-helpers/util'
import chalk from 'chalk'
import { packBackendLambdas } from '../../cdk/packBackendLambdas.ts'
import type { CommandDefinition } from './CommandDefinition.ts'

const isPackedLambda = (v: unknown): v is PackedLambda =>
	typeof v === 'object' &&
	v !== null &&
	'id' in v &&
	'zipFilePath' in v &&
	'hash' in v

const flatten = (
	lambdas: Record<string, unknown>,
): Record<string, PackedLambda> =>
	Object.fromEntries(
		Object.values(lambdas).flatMap((v) => {
			if (isPackedLambda(v)) return [[v.id, v]]
			if (typeof v === 'object' && v !== null)
				return Object.entries(flatten(v as Record<string, unknown>))
			return []
		}),
	)

export const updateLambda = ({
	stackName,
	cf,
	lambda,
}: {
	stackName: string
	cf: CloudFormationClient
	lambda: LambdaClient
}): CommandDefinition => ({
	command: 'update-lambda [id]',
	action: async (id?: string) => {
		const start = new Date()
		const lambdas = flatten(await packBackendLambdas())
		console.debug(
			'Packed lambdas in',
			new Date().getTime() - start.getTime(),
			'ms',
		)

		const filteredLambdas =
			id === undefined
				? lambdas
				: Object.fromEntries(
						Object.entries(lambdas).filter(([lambdaId]) => {
							if (lambdaId === id) return true
							console.debug(
								chalk.blue(`[${stackName}]`),
								chalk.green(`[${lambdaId}]`),
								'skipped',
							)
							return false
						}),
					)

		if (Object.keys(filteredLambdas).length === 0)
			throw new Error(`No lambda found for ${id}!`)

		await updateLambdaCode({ cf, lambda })(
			stackName,
			filteredLambdas,
			(arg, ...args: Array<unknown>) =>
				console.debug(chalk.blue(`[${stackName}]`), chalk.green(arg), ...args),
		)

		console.debug(
			'Updated lambdas in',
			new Date().getTime() - start.getTime(),
			'ms',
		)
	},
	help: 'Updates the code of all lambdas (or the one with the given ID) directly, if changed',
})
