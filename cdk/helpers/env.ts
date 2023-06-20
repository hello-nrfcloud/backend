import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts'
import type { Environment } from 'aws-cdk-lib'

export const env = async ({
	sts,
}: {
	sts: STSClient
}): Promise<Required<Environment>> => {
	const { Account } = await sts.send(new GetCallerIdentityCommand({}))
	if (Account === undefined) throw new Error(`Failed to get caller identity!`)
	return {
		account: Account,
		region:
			process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? 'eu-west-1',
	}
}
