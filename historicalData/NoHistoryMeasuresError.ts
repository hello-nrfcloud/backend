export class NoHistoryMeasuresError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'NoHistoryMeasuresError'
	}
}
