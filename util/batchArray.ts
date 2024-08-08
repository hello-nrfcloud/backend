export const batchArray = <A extends Array<any>>(
	array: A,
	size: number,
): Array<A> =>
	array.reduce(
		(batched, item) => {
			const lastBatch = batched[batched.length - 1]!
			if (lastBatch.length === size) {
				batched.push([item])
			} else {
				lastBatch.push(item)
			}
			return batched
		},
		[[]],
	)
