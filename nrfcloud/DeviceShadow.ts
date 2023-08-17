export type DeviceShadow = {
	id: string
	state: {
		reported: Record<string, any>
		version: number
		metadata: Record<string, any>
	}
}
