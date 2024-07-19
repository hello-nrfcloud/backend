import jwt from 'jsonwebtoken'
import { DeviceJWTPayload } from '@hello.nrfcloud.com/proto-map/api'
import { validateWithTypeBox } from '@hello.nrfcloud.com/proto'
import { ValidationError } from '../../util/ValidationError.js'

const validateDeviceJWTPayload = validateWithTypeBox(DeviceJWTPayload)

/**
 * Validate a device JWT
 */
export const deviceJWT =
	(publicKeys: Map<string, string>) =>
	(
		token: string,
	):
		| {
				device: {
					id: string
					model: string
					deviceId: string
				}
		  }
		| { error: Error } => {
		try {
			const decoded = jwt.decode(token, { complete: true })

			const header = decoded?.header as jwt.JwtHeader
			const payload = decoded?.payload as jwt.JwtPayload

			if (header.kid === undefined)
				return { error: new Error('No key ID found in JWT header') }

			const publicKey = publicKeys.get(header.kid)
			if (publicKey === undefined)
				return {
					error: new Error(`No public key found for key ID ${header.kid}`),
				}

			jwt.verify(token, publicKey, {
				audience: 'hello.nrfcloud.com',
			}) as jwt.JwtPayload

			const maybeValid = validateDeviceJWTPayload(payload)

			if ('errors' in maybeValid)
				return {
					error: new ValidationError(maybeValid.errors),
				}

			return {
				device: maybeValid.value,
			}
		} catch (err) {
			return { error: err as Error }
		}
	}
