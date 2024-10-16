import {
	DescribeStackResourceCommand,
	type CloudFormationClient,
} from '@aws-sdk/client-cloudformation'
import {
	GetFunctionCommand,
	LastUpdateStatus,
	UpdateFunctionCodeCommand,
	UpdateFunctionConfigurationCommand,
	type LambdaClient,
} from '@aws-sdk/client-lambda'
import {
	packLambdaFromPath,
	type PackedLambda,
} from '@bifravst/aws-cdk-lambda-helpers'
import { listStackResources } from '@bifravst/cloudformation-helpers'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import pRetry from 'p-retry'
import { packGo } from '../../cdk/helpers/lambda/packGo.js'
import type { CommandDefinition } from './CommandDefinition.js'

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
			flags: '-s, --source-file <sourceFile>',
			description: `Update the lambda from this source file`,
		},
		{
			flags: '-p, --physical-resource-id <physicalResourceId>',
			description: `Update the lambda with this physical resource ID`,
		},
		{
			flags: '-v, --version <version>',
			description: `Set the version environment variable`,
		},
	],
	action: async (id, { physicalResourceId: pId, version, sourceFile }) => {
		const stackFunctionIds = await listStackResources(
			cf,
			stackName,
			'AWS::Lambda::Function',
		)

		const stackFunctions: Array<{
			PhysicalResourceId: string
			id?: string
		}> = []

		for (const { StackResourceDetail } of await Promise.all(
			stackFunctionIds.map(async ({ LogicalResourceId }) =>
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

		const fnInfo = await lambda.send(
			new GetFunctionCommand({
				FunctionName: functionToUpdate.PhysicalResourceId,
			}),
		)

		console.log(`[${id}] Updating (${functionToUpdate.PhysicalResourceId}) ...`)

		let res: PackedLambda | undefined = undefined

		switch (fnInfo.Configuration?.Runtime) {
			case 'nodejs20.x':
				res = await packLambdaFromPath(id, `lambda/${sourceFile ?? id}.ts`)
				break
			case 'provided.al2023':
				if (id !== 'healthCheckForCoAPClient')
					throw new Error(`Unsupported Go lambda ${id}!`)
				res = await packGo(id, 'lambda/health-check/coap/client')
				break
			default:
				throw new Error(`Unsupported runtime ${fnInfo.Configuration?.Runtime}`)
		}

		const updateResult = await lambda.send(
			new UpdateFunctionCodeCommand({
				FunctionName: functionToUpdate.PhysicalResourceId,
				ZipFile: new Uint8Array(await readFile(res.zipFile)),
			}),
		)

		console.log('RevisionId', updateResult.RevisionId)
		console.log('CodeSha256', updateResult.CodeSha256)

		await pRetry(
			async () => {
				const updateStatus = (
					await lambda.send(
						new GetFunctionCommand({
							FunctionName: functionToUpdate.PhysicalResourceId,
						}),
					)
				).Configuration?.LastUpdateStatus
				assert.equal(
					updateStatus,
					LastUpdateStatus.Successful,
					`Lambda update should have succeeded, got ${updateStatus}`,
				)
			},
			{
				minTimeout: 1000,
				maxTimeout: 1000,
				retries: 10,
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
