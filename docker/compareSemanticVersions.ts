import semver from 'semver'

export const compareSemanticVersions = (v1: string, v2: string): number =>
	semver.compare(padVersion(v1), padVersion(v2))

/**
 * Docker version strings can be just plain numbers
 */
const padVersion = (v: string) => (semver.valid(v) !== null ? v : `${v}.0.0`)
