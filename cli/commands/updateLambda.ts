import {
	DescribeStackResourceCommand,
	ListStackResourcesCommand,
	type CloudFormationClient,
} from '@aws-sdk/client-cloudformation'
import {
	UpdateFunctionCodeCommand,
	UpdateFunctionConfigurationCommand,
	type LambdaClient,
	GetFunctionCommand,
	LastUpdateStatus,
} from '@aws-sdk/client-lambda'
import type { CommandDefinition } from './CommandDefinition.js'
import { packLambdaFromPath } from '@bifravst/aws-cdk-lambda-helpers'
import { readFile } from 'node:fs/promises'
import pRetry from 'p-retry'
import assert from 'node:assert/strict'

const listStackLambdas = async (
	cf: CloudFormationClient,
	stackName: string,
	lambdas: Array<string> = [],
	nextToken?: string,
): Promise<Array<string>> => {
	const { StackResourceSummaries, NextToken } = await cf.send(
		new ListStackResourcesCommand({
			StackName: stackName,
			NextToken: nextToken,
		}),
	)

	lambdas.push(
		...(StackResourceSummaries ?? [])
			.filter(({ ResourceType }) => ResourceType === 'AWS::Lambda::Function')
			.map(({ LogicalResourceId }) => LogicalResourceId as string),
	)

	if (NextToken !== undefined)
		return listStackLambdas(cf, stackName, lambdas, NextToken)

	return lambdas
}

export const updateLambda = ({
	stackName,
	cf,
	lambda,
}: {
	stackName: string
	cf: CloudFormationClient
	lambda: LambdaClient
}): CommandDefinition => ({
	command: 'update-lambda <id>',
	options: [
		{
			flags: '-p, --physical-resource-id <physicalResourceId>',
			description: `Update the lambda with this physical resource ID`,
		},
		{
			flags: '-v, --version <version>',
			description: `Set the version environment variable`,
		},
	],
	action: async (id, { physicalResourceId: pId, version }) => {
		const stackFunctionIds = await listStackLambdas(cf, stackName)

		const stackFunctions: Array<{
			PhysicalResourceId: string
			id?: string
		}> = []

		for (const { StackResourceDetail } of await Promise.all(
			stackFunctionIds.map(async (LogicalResourceId) =>
				cf.send(
					new DescribeStackResourceCommand({
						StackName: stackName,
						LogicalResourceId,
					}),
				),
			),
		)) {
			const { PhysicalResourceId, Metadata } = StackResourceDetail ?? {}
			if (PhysicalResourceId === undefined) continue

			stackFunctions.push({
				PhysicalResourceId,
				// Try to match by packed lambda ID
				id: JSON.parse(Metadata ?? '{}')['packedlambda:id'],
			})
		}

		let functionToUpdate = stackFunctions.find(
			({ id: packedId }) => packedId === id,
		)

		if (functionToUpdate === undefined) {
			const matchById = stackFunctions.filter(({ PhysicalResourceId }) =>
				PhysicalResourceId.includes(pId ?? id),
			)
			if (matchById.length === 1) functionToUpdate = matchById[0]
		}

		if (functionToUpdate === undefined) {
			for (const fn of stackFunctions) {
				console.debug(`- ${fn.id ?? '?'} (${fn.PhysicalResourceId})`)
			}
			throw new Error(`No function found for ${id}!`)
		}

		console.log(`[${id}] Updating (${functionToUpdate.PhysicalResourceId}) ...`)

		const res = await packLambdaFromPath(id, `lambda/${id}.ts`)

		const updateResult = await lambda.send(
			new UpdateFunctionCodeCommand({
				FunctionName: functionToUpdate.PhysicalResourceId,
				ZipFile: await readFile(res.zipFile),
			}),
		)

		console.log('RevisionId', updateResult.RevisionId)
		console.log('CodeSha256', updateResult.CodeSha256)

		await pRetry(
			async () => {
				assert.equal(
					(
						await lambda.send(
							new GetFunctionCommand({
								FunctionName: functionToUpdate.PhysicalResourceId,
							}),
						)
					).Configuration?.LastUpdateStatus,
					LastUpdateStatus.Successful,
					'Lambda update should have succeeded.',
				)
			},
			{
				minTimeout: 1000,
				maxTimeout: 1000,
				retries: 5,
			},
		)

		if (typeof version === 'string') {
			console.log(`[${id}] updating VERSION to ${version} ...`)

			await lambda.send(
				new UpdateFunctionConfigurationCommand({
					FunctionName: functionToUpdate.PhysicalResourceId,
					Environment: {
						Variables: {
							VERSION: version,
						},
					},
				}),
			)
		}
	},
	help: 'Updates a lambda directly',
})
