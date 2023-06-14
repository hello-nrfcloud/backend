import {
	CreateOpenIDConnectProviderCommand,
	GetOpenIDConnectProviderCommand,
	IAMClient,
	ListOpenIDConnectProvidersCommand,
} from '@aws-sdk/client-iam'
import chalk from 'chalk'

/**
 * Returns the ARN of the OpenID Connect provider for GitHub of the account.
 */
export const ensureGitHubOIDCProvider = async ({
	iam,
}: {
	iam: IAMClient
}): Promise<string> => {
	const { OpenIDConnectProviderList } = await iam.send(
		new ListOpenIDConnectProvidersCommand({}),
	)

	const maybeGithubProvider = (
		await Promise.all(
			OpenIDConnectProviderList?.map(async ({ Arn }) =>
				iam
					.send(
						new GetOpenIDConnectProviderCommand({
							OpenIDConnectProviderArn: Arn,
						}),
					)
					.then((provider) => ({ Arn, provider })),
			) ?? [],
		)
	).find(
		({ provider: { Url } }) => Url === 'token.actions.githubusercontent.com',
	)

	if (maybeGithubProvider?.Arn !== undefined) {
		console.debug(
			chalk.green(
				`OIDC provider for GitHub exists: ${maybeGithubProvider.Arn}`,
			),
		)
		return maybeGithubProvider.Arn
	}

	console.log(
		chalk.yellow(`OIDC provider for GitHub does not exist. Creating ...`),
	)

	const provider = await iam.send(
		new CreateOpenIDConnectProviderCommand({
			Url: `https://token.actions.githubusercontent.com`,
			ClientIDList: ['sts.amazonaws.com'],
			ThumbprintList: ['6938fd4d98bab03faadb97b34396831e3780aea1'],
		}),
	)

	if (provider.OpenIDConnectProviderArn === undefined)
		throw new Error(`Failed to create OpenID Connect Provider for GitHub!`)

	return provider.OpenIDConnectProviderArn
}
