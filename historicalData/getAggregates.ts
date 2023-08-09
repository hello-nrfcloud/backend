import type { CommonRequest } from "@hello.nrfcloud.com/proto/hello/history"
import type { Static } from "@sinclair/typebox"

export const getAggregates = (
	attributes: Static<typeof CommonRequest>['attributes'],
): string[] => {
	const aggs: string[] = []

	for (const prop in attributes) {
		const attribute = attributes[prop as keyof typeof attributes]
		if ('aggregate' in attribute) {
			aggs.push(`${attribute.aggregate}(measure_value::double) as "${prop}"`)
		}
	}

	return aggs
}
