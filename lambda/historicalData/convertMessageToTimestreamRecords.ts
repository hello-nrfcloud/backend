import { type _Record } from '@aws-sdk/client-timestream-write'
import { toRecord } from '@nordicsemiconductor/timestream-helpers'
import { randomUUID } from 'node:crypto'
import { isNotNullOrUndefined } from '../../util/isNullOrUndefined.js'

type Proto = {
	'@context': string
	ts: number
}

type GenericObject = {
	[k: string]: number | string
} & Proto

export const convertMessageToTimestreamRecords = (
	message: GenericObject,
): _Record[] => {
	// Do not convert message if it is not proto message i.e. having '@context' and 'ts' properties
	if (!('@context' in message && 'ts' in message)) return []

	const measureGroup = randomUUID()

	const Records: (_Record | undefined)[] = []
	for (const prop in message) {
		if (
			prop !== '@context' &&
			prop !== 'ts' &&
			typeof message[prop] === 'number'
		) {
			Records.push(
				toRecord({
					name: prop,
					ts: message.ts,
					v: message[prop],
					dimensions: {
						measureGroup,
						'@context': message['@context'],
					},
				}),
			)
		}
	}

	return Records.filter(isNotNullOrUndefined) as _Record[]
}
