import semver from 'semver'
import { padVersion } from './padVersion'

export const compareSemanticVersions = (v1: string, v2: string): number =>
	semver.compare(padVersion(v1), padVersion(v2))
