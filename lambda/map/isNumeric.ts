import { ResourceType } from '@hello.nrfcloud.com/proto-map'

/**
 * Only store numeric values, because you cannot create statistics about strings, or boolean
 */
export const isNumeric = (def: { Type: ResourceType }): boolean => {
	switch (def.Type) {
		case ResourceType.Float:
		case ResourceType.Integer:
		case ResourceType.Time:
			return true
		case ResourceType.String:
		case ResourceType.Opaque:
		case ResourceType.Boolean:
			return false
	}
}
