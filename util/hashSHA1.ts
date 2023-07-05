import { createHash } from 'node:crypto'

export const hashSHA1 = (s: string): string => {
	return createHash('sha1').update(s).digest('hex')
}
