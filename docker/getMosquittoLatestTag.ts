import { compareSemanticVersions } from './compareSemanticVersions.js'
import { getAllImageTags } from './getAllImageTags.js'

const mosquittoImageName = 'eclipse-mosquitto'
const architecture = 'amd64'

export const getMosquittoLatestTag = async (): Promise<string> => {
	const tags = await getAllImageTags(mosquittoImageName, architecture)
	if (tags.length > 0) {
		tags.sort(compareSemanticVersions).reverse()
		return tags[0] ?? ''
	} else {
		throw new Error(`Docker image (${mosquittoImageName}) is not found`)
	}
}
