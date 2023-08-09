export const normalizedData = (
	data: Record<string, unknown>[],
): Record<string, unknown>[] =>
	data.map((o) => {
		const key = 'measure_name' in o ? (o['measure_name'] as string) : undefined
		const val =
			'measure_value::double' in o ? o['measure_value::double'] : undefined
		if (key !== undefined && val !== undefined) {
			o[key] = val
		}

		return o
	})
