import { Type } from '@sinclair/typebox'

export const MemfaultReboot = Type.Object({
	type: Type.Literal('memfault'),
	time: Type.String({ minLength: 1 }),
	reason: Type.Integer({ minimum: 0 }),
})

export const MemfaultReboots = Type.Object({ data: Type.Array(MemfaultReboot) })
