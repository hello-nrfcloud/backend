export class InvalidTimeError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'InvalidTimeError'
	}
}
