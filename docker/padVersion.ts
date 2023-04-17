import semver, { coerce } from 'semver'

/**
 * Docker version strings can be just plain numbers
 */

export const padVersion = (v: string): string =>
	semver.valid(v) !== null ? v : coerce(v)?.format() ?? '0.0.0'
