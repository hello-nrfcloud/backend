import {
	accuracy as TAccuracy,
	lat as TLat,
	lng as TLng,
} from '@hello.nrfcloud.com/proto/hello'
import { Type } from '@sinclair/typebox'

/**
 * @link https://api.nrfcloud.com/v1/#tag/Ground-Fix
 */
export const GroundFix = Type.Object({
	lat: TLat, // 63.41999531
	lon: TLng, // 10.42999506
	uncertainty: TAccuracy, // 2420
	fulfilledWith: Type.Literal('SCELL'),
})
