import {
	DeleteItemCommand,
	GetItemCommand,
	PutItemCommand,
	QueryCommand,
	type DynamoDBClient,
} from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import type { FOTAJobTarget } from '@hello.nrfcloud.com/proto/hello'
import { FOTAJobStatus, type FOTAJob } from '@hello.nrfcloud.com/proto/hello'
import type { Static } from '@sinclair/typebox'

/**
 * The `pk` is used to prevent multiple jobs for the same device.
 *
 * The workflow is as follows:
 * - A job is created with status `NEW`, pk = <deviceID>#<target>
 * - the job is started by setting the status to `IN_PROGRESS`, pk is kept as <deviceID>#<target>
 * - once the job finishes, the status is updated to `SUCCESS` or `FAILURE`, pk is changed to `<deviceID>#<target>#<status>#timestamp`
 */

export type PersistedJob = Omit<Static<typeof FOTAJob>, '@context'> & {
	/**
	 * The primary key for the job
	 */
	pk: string
	/**
	 * The nRF Cloud account
	 */
	account: string
	/**
	 * The target of the job
	 */
	target: FOTAJobTarget
	/**
	 * The firmware versions for which a JOB was created.
	 */
	usedVersions?: Set<string>
}

export const pkFromTarget = ({
	deviceId,
	target,
}: Pick<PersistedJob, 'deviceId'> & { target: FOTAJobTarget }): string =>
	`${deviceId}#${target}`

export const create =
	(db: DynamoDBClient, TableName: string) =>
	async (
		job: Omit<PersistedJob, 'pk' | 'usedVersions'>,
	): Promise<{
		pk: string
	}> => {
		const pk = pkFromTarget(job)
		await db.send(
			new PutItemCommand({
				TableName,
				Item: marshall({
					...job,
					pk,
					ttl: Math.round(Date.now() / 1000) + 60 * 60 * 24 * 30,
				}),
				ConditionExpression: 'attribute_not_exists(pk)',
			}),
		)
		return { pk }
	}

/**
 * Mark a job as failed
 */
export const fail =
	(db: DynamoDBClient, TableName: string) =>
	async (pk: string, id: string, reason: string, date: Date): Promise<void> => {
		const job = await getByPK(db, TableName)(pk)
		if (job === null) throw new Error(`Job ${pk} not found!`)
		if (job.id !== id) throw new Error(`Job ID mismatch!`)
		await db.send(
			new PutItemCommand({
				TableName,
				Item: marshall(
					{
						...job,
						pk: job.id,
						status: FOTAJobStatus.FAILED,
						statusDetail: reason,
						timestamp: date.toISOString(),
					},
					{ removeUndefinedValues: true },
				),
			}),
		)
		await db.send(
			new DeleteItemCommand({
				TableName,
				Key: marshall({
					pk,
				}),
			}),
		)
	}

export const getByPK =
	(db: DynamoDBClient, TableName: string) =>
	async (pk: string): Promise<PersistedJob | null> => {
		const res = await db.send(
			new GetItemCommand({
				TableName,
				Key: marshall({ pk }),
			}),
		)
		if (res.Item === undefined) return null
		return unmarshall(res.Item) as unknown as PersistedJob
	}

export const getById =
	(db: DynamoDBClient, TableName: string, IndexName: string) =>
	async (id: string): Promise<PersistedJob | null> => {
		const res = await db.send(
			new QueryCommand({
				TableName,
				IndexName,
				KeyConditionExpression: '#id = :id',
				ExpressionAttributeNames: {
					'#id': 'id',
				},
				ExpressionAttributeValues: {
					':id': { S: id },
				},
			}),
		)
		const pk = res.Items?.[0]?.pk?.S
		if (pk === undefined) throw new Error(`Job ${id} not found!`)
		return getByPK(db, TableName)(pk)
	}
