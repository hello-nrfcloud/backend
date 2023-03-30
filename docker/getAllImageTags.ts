type Image = {
	architecture: string
	digest: string
	status: string
}

type TagDetail = {
	images: Image[]
	name: string
	tag_status: string
	digest: string
}

type RepositoryTagResult = {
	count: number
	next: string | null
	previous: string | null
	results: TagDetail[]
}

type ImageTag = {
	name: string
	digest: string
	image: Image
}

export const getAllImageTags = async (
	imageName: string,
	architecture: string,
): Promise<string[]> => {
	const endpoint = `https://registry.hub.docker.com/v2/repositories/library/${imageName}/tags/`
	const pageSize = 100

	const allImageTags: ImageTag[] = []
	let url: string | null = `${endpoint}?page_size=${pageSize}`
	do {
		const res = await fetch(url, { method: 'get' })
		if (res.ok) {
			const result: RepositoryTagResult = await res.json()
			url = result.next

			result.results.forEach((tag) => {
				if (tag.tag_status === 'active') {
					const archImage = tag.images.find(
						(image) =>
							image.architecture === architecture && image.status === 'active',
					)
					if (archImage !== undefined) {
						allImageTags.push({
							name: tag.name,
							digest: tag.digest,
							image: archImage,
						})
					}
				}
			})
		} else {
			throw new Error(res.statusText)
		}
	} while (url !== null)

	// Get latest image's digest
	const latestDigest = allImageTags.find((image) => image.name === 'latest')

	// Find all tags having the same latest image's digest
	if (latestDigest !== undefined) {
		const latestVersionTags = allImageTags.filter(
			(image) =>
				image.digest === latestDigest.digest && image.name !== 'latest',
		)

		return latestVersionTags?.map((image) => image.name)
	} else {
		return []
	}
}
