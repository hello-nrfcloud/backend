import { requestLogger } from '@hello.nrfcloud.com/lambda-helpers/requestLogger'
import middy from '@middy/core'

const h = async (/*event: {
	reported: {
		'14204:1.0': {
			'0': {
				'3': '2.0.1'
				'99': 1725746800
			}
		}
	}
	deviceId: string
}*/): Promise<void> => {}
export const handler = middy().use(requestLogger()).handler(h)
