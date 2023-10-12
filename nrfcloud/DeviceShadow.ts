import { Type, type Static } from '@sinclair/typebox'

const PropertyMetadata = Type.Union([
	Type.Object({ timestamp: Type.Integer({ minimum: 1, maximum: 9999999999 }) }),
	Type.Record(Type.String({ minLength: 1 }), Type.Unknown()),
])

/**
 * @link https://api.nrfcloud.com/v1/#tag/All-Devices/operation/ListDevices
 */
export const DeviceShadow = Type.Object({
	id: Type.String(),
	state: Type.Object({
		reported: Type.Object({}),
		version: Type.Number(),
		metadata: Type.Object({
			reported: Type.Record(Type.String({ minLength: 1 }), PropertyMetadata),
		}),
	}),
})

export type DeviceShadowType = Static<typeof DeviceShadow>
