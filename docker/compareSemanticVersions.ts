type SemVer = {
	major: number
	minor: number
	patch: number
}

const toSemVer = (version: string): SemVer => {
	const [major, minor, patch] = version.split('.').map(Number)
	return { major: major ?? 0, minor: minor ?? 0, patch: patch ?? 0 }
}

export const compareSemanticVersions = (v1: string, v2: string): number => {
	const a = toSemVer(v1)
	const b = toSemVer(v2)

	if (a.major !== b.major) {
		return a.major - b.major
	}

	if (a.minor !== b.minor) {
		return a.minor - b.minor
	}

	if (a.patch !== b.patch) {
		return a.patch - b.patch
	}

	return 0
}
