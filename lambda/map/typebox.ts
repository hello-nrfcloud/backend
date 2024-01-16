import { Type } from '@sinclair/typebox'

export const DeviceId = Type.RegExp(/^[a-zA-Z0-9:_-]{1,128}$/, {
	title: 'Device ID',
	description: 'Must follow the AWS IoT limitations for Thing names.',
})

export const PublicDeviceId = Type.RegExp(/^[a-z]{8}-[a-z]{8}-[a-z]{8}$/, {
	title: 'Public Device ID',
	description:
		'This is the format of @nordicsemiconductor/random-words which is used for public IDs.',
})
