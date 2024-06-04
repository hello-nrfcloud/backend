import {
	ListStackResourcesCommand,
	type CloudFormationClient,
} from '@aws-sdk/client-cloudformation'

export const listStackResources = async (
	cf: CloudFormationClient,
	stackName: string,
	ResourceType: string | Array<string>, // e.g. 'AWS::Lambda::Function'
	resources: Array<{
		PhysicalResourceId: string
		LogicalResourceId: string
	}> = [],
	nextToken?: string,
): Promise<
	Array<{
		PhysicalResourceId: string
		LogicalResourceId: string
	}>
> => {
	const { StackResourceSummaries, NextToken } = await cf.send(
		new ListStackResourcesCommand({
			StackName: stackName,
			NextToken: nextToken,
		}),
	)

	resources.push(
		...(StackResourceSummaries ?? [])
			.filter((res) =>
				Array.isArray(ResourceType)
					? ResourceType.includes(res.ResourceType ?? '')
					: res.ResourceType === ResourceType,
			)
			.map(({ LogicalResourceId, PhysicalResourceId }) => ({
				PhysicalResourceId: PhysicalResourceId as string,
				LogicalResourceId: LogicalResourceId as string,
			})),
	)

	if (NextToken !== undefined)
		return listStackResources(cf, stackName, ResourceType, resources, NextToken)

	return resources
}
