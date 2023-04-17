import semver from 'semver'

/**
 * Docker version strings can be just plain numbers
 */

export const padVersion = (v: string): string =>
	semver.valid(v) !== null ? v : padZeros(v)

const padZeros = (s: string): string => {
	while (s.split('.').length < 3) {
		s = `${s}.0`
	}
	return s
}
