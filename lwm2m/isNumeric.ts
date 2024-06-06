import { ResourceType } from '@hello.nrfcloud.com/proto-map/lwm2m'

/**
 * Only store numeric values, because you cannot create statistics about strings, or boolean
 */
export const isNumeric = (def: { Type: ResourceType }): boolean => {
	switch (def.Type) {
		case ResourceType.Float:
		case ResourceType.Integer:
			return true
		case ResourceType.String:
		case ResourceType.Opaque:
		case ResourceType.Boolean:
		case ResourceType.Time: // Time is numeric, but is stored as timestamp
			return false
	}
}
