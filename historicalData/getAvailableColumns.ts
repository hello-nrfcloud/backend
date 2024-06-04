import {
	QueryCommand,
	type TimestreamQueryClient,
} from '@aws-sdk/client-timestream-query'

export const getAvailableColumns =
	(ts: TimestreamQueryClient, DatabaseName: string, TableName: string) =>
	async (): Promise<Array<string>> =>
		(
			await ts.send(
				new QueryCommand({
					QueryString: `SELECT * FROM "${DatabaseName}"."${TableName}" LIMIT 1`,
				}),
			)
		)?.ColumnInfo?.map(({ Name }) => Name as string) ?? []
