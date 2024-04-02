type ReturnDefer<T> = {
	promise: Promise<T>
	resolve: (value: T) => void
	reject: (reason: any) => void
}

export class DeferTimeoutError extends Error {
	constructor(message = 'Timeout') {
		super(message)
		Object.setPrototypeOf(this, DeferTimeoutError.prototype)
	}
}

export const defer = <T>(timeoutMS: number): ReturnDefer<T> => {
	const ret = {} as ReturnDefer<T>
	const timer = setTimeout(() => {
		ret.reject(new DeferTimeoutError())
	}, timeoutMS)

	const promise = new Promise<T>((_resolve, _reject) => {
		ret.resolve = (v) => {
			clearTimeout(timer)
			_resolve(v)
		}
		ret.reject = (reason) => {
			clearTimeout(timer)
			_reject(reason)
		}
	})

	ret.promise = promise

	return ret
}
