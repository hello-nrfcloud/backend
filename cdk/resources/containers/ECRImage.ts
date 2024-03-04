import type { ContainerRepository } from '../../../aws/getOrCreateRepository.js'

export type ECRImage = {
	imageTag: string
	repo: ContainerRepository
	repositoryName: string
}
