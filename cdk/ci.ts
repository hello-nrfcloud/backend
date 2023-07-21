import { IAMClient } from '@aws-sdk/client-iam'
import pJSON from '../package.json'
import { ensureGitHubOIDCProvider } from './ensureGitHubOIDCProvider.js'
import { App } from 'aws-cdk-lib'
import { CIStack } from './stacks/CIStack.js'

const repoUrl = new URL(pJSON.repository.url)
const repository = {
	owner: repoUrl.pathname.split('/')[1] ?? 'hello-nrfcloud',
	repo: repoUrl.pathname.split('/')[2]?.replace(/\.git$/, '') ?? 'backend',
}

const iam = new IAMClient({})

class CIApp extends App {
	public constructor(args: ConstructorParameters<typeof CIStack>[1]) {
		super()

		new CIStack(this, args)
	}
}

new CIApp({
	repository,
	gitHubOICDProviderArn: await ensureGitHubOIDCProvider({
		iam,
	}),
})
