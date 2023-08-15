import {
	QueryCommand,
	type QueryCommandOutput,
	type TimestreamQueryClient,
} from '@aws-sdk/client-timestream-query'

/**
 * Paginates a Timestream query result.
 *
 * @see https://docs.aws.amazon.com/timestream/latest/developerguide/code-samples.run-query.html
 */
export const paginateTimestreamQuery =
	(client: TimestreamQueryClient) =>
	async (
		QueryString: string,
		previousResult?: QueryCommandOutput,
	): Promise<QueryCommandOutput> => {
		const res = await client.send(
			new QueryCommand({
				QueryString,
				NextToken: previousResult?.NextToken,
			}),
		)
		const currentResult = {
			...res,
			Rows: [...(previousResult?.Rows ?? []), ...(res.Rows ?? [])],
		}
		if (res.NextToken !== undefined)
			return paginateTimestreamQuery(client)(QueryString, currentResult)
		return currentResult
	}
