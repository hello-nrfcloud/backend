import {
	DescribeStackResourceCommand,
	DescribeStackResourcesCommand,
	type CloudFormationClient,
} from '@aws-sdk/client-cloudformation'
import {
	UpdateFunctionCodeCommand,
	type LambdaClient,
} from '@aws-sdk/client-lambda'
import type { CommandDefinition } from './CommandDefinition.js'
import { packLambdaFromPath } from '@bifravst/aws-cdk-lambda-helpers'
import { readFile } from 'node:fs/promises'

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
	],
	action: async (id, { physicalResourceId: pId }) => {
		const { StackResources } = await cf.send(
			new DescribeStackResourcesCommand({
				StackName: stackName,
			}),
		)

		const stackFunctionIds = (StackResources ?? [])
			.filter(({ ResourceType }) => ResourceType === 'AWS::Lambda::Function')
			.map(({ LogicalResourceId }) => LogicalResourceId)

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

		console.log(`Updating ${id} (${functionToUpdate.PhysicalResourceId}) ...`)

		const res = await packLambdaFromPath(id, `lambda/${id}.ts`)

		const updateResult = await lambda.send(
			new UpdateFunctionCodeCommand({
				FunctionName: functionToUpdate.PhysicalResourceId,
				ZipFile: await readFile(res.zipFile),
			}),
		)

		console.log('RevisionId', updateResult.RevisionId)
		console.log('CodeSha256', updateResult.CodeSha256)
	},
	help: 'Updates a lambda directly',
})
