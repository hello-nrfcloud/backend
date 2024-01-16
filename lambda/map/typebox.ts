import { Type } from '@sinclair/typebox'

export const DeviceId = Type.RegExp(/^[a-zA-Z0-9:_-]{1,128}$/, {
	title: 'Device ID',
	description: 'Must follow the AWS IoT limitations for Thing names.',
})
