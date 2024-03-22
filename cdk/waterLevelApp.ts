import { App } from 'aws-cdk-lib'
import pJSON from '../package.json'
import { IAMClient } from '@aws-sdk/client-iam'
import { ensureGitHubOIDCProvider } from './ensureGitHubOIDCProvider'
import { waterLevelStack } from './stacks/waterLevelStack.js'

const repoUrl = new URL(pJSON.repository.url)
const repository = {
	owner: repoUrl.pathname.split('/')[1] ?? 'hello-nrfcloud',
	repo: repoUrl.pathname.split('/')[2]?.replace(/\.git$/, '') ?? 'backend',
}

const iam = new IAMClient({})

export type Repository = {
	owner: string
	repo: string
}

export class WaterLevelApp extends App {
	public constructor({
		repository,
		gitHubOICDProviderArn,
		version,
	}: {
		repository: Repository
		gitHubOICDProviderArn: string
		version: string
	}) {
		super({
			context: {
				version,
			},
		})

		new waterLevelStack(this, {
			repository,
			gitHubOICDProviderArn,
		})
	}
}

new WaterLevelApp({
	repository,
	gitHubOICDProviderArn: await ensureGitHubOIDCProvider({
		iam,
	}),
	version: process.env.VERSION ?? '0.0.0-development',
})
