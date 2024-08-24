import {
	DeleteItemCommand,
	GetItemCommand,
	PutItemCommand,
	UpdateItemCommand,
	type DynamoDBClient,
} from '@aws-sdk/client-dynamodb'
import { marshall } from '@aws-sdk/util-dynamodb'
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
}

export const pkFromTarget = ({
	deviceId,
	target,
}: Pick<PersistedJob, 'deviceId'> & { target: FOTAJobTarget }): string =>
	`${deviceId}#${target}`

export const create =
	(db: DynamoDBClient, TableName: string) =>
	async (job: Omit<PersistedJob, 'pk'>): Promise<void> => {
		await db.send(
			new PutItemCommand({
				TableName,
				Item: marshall({
					...job,
					pk: pkFromTarget(job),
					ttl: Math.round(Date.now() / 1000) + 60 * 60 * 24 * 30,
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
		return marshall(res.Item) as unknown as PersistedJob
	}

export const update =
	(db: DynamoDBClient, TableName: string) =>
	async (
		update: Pick<PersistedJob, 'status' | 'statusDetail'> & {
			reportedVersion?: PersistedJob['reportedVersion']
		},
		current: Pick<
			PersistedJob,
			'pk' | 'deviceId' | 'timestamp' | 'upgradePath' | 'reportedVersion'
		>,
	): Promise<void> => {
		const now = new Date().toISOString()
		if (update.status === FOTAJobStatus.NEW)
			throw new Error(`Cannot set status to NEW!`)
		if (update.status !== FOTAJobStatus.IN_PROGRESS) {
			const currentJob = await getByPK(db, TableName)(current.pk)
			if (currentJob === null) {
				throw new Error(`Job not found!`)
			}
			await db.send(
				new PutItemCommand({
					TableName,
					Item: marshall({
						...currentJob,
						pk: `${current.deviceId}#${update.status}#${now}`,
					}),
				}),
			)
			await db.send(
				new DeleteItemCommand({
					TableName,
					Key: { pk: { S: current.deviceId } },
				}),
			)
			return
		}
		await db.send(
			new UpdateItemCommand({
				TableName,
				Key: {
					pk: {
						S: current.deviceId,
					},
				},
				UpdateExpression:
					'SET #status = :status, #statusDetail = :statusDetail, #timestamp = :now, #reportedVersion = :reportedVersion',
				ExpressionAttributeNames: {
					'#status': 'status',
					'#statusDetail': 'statusDetail',
					'#timestamp': 'timestamp',
					'#reportedVersion': 'reportedVersion',
				},
				ExpressionAttributeValues: {
					':now': { S: now },
					':status': { S: update.status },
					':statusDetail': { S: update.statusDetail },
					':timestamp': { S: current.timestamp },
					':reportedVersion': {
						S: update.reportedVersion ?? current.reportedVersion,
					},
				},
				ConditionExpression: '#timestamp = :timestamp',
				ReturnValues: 'NONE',
			}),
		)
	}
