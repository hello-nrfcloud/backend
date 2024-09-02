import { requestLogger } from '@hello.nrfcloud.com/lambda-helpers/requestLogger'
import middy from '@middy/core'

const h = async (): Promise<void> => {}
export const handler = middy().use(requestLogger()).handler(h)
