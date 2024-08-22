import {
	DeleteItemCommand,
	GetItemCommand,
	PutItemCommand,
	UpdateItemCommand,
	type DynamoDBClient,
} from '@aws-sdk/client-dynamodb'
import { marshall } from '@aws-sdk/util-dynamodb'
import { FOTAJobStatus, type FOTAJob } from '@hello.nrfcloud.com/proto/hello'
import type { Static } from '@sinclair/typebox'

export type PersistedJob = Omit<Static<typeof FOTAJob>, '@context'>

export const create =
	(db: DynamoDBClient, TableName: string) =>
	async (job: PersistedJob): Promise<void> => {
		await db.send(
			new PutItemCommand({
				TableName,
				Item: marshall({
					pk: job.deviceId,
					...job,
					ttl: Math.round(Date.now() / 1000) + 60 * 60 * 24 * 30,
				}),
			}),
		)
	}

export const getByDeviceId =
	(db: DynamoDBClient, TableName: string) =>
	async (deviceId: string): Promise<PersistedJob | null> => {
		const res = await db.send(
			new GetItemCommand({
				TableName,
				Key: {
					pk: {
						S: deviceId,
					},
				},
			}),
		)
		if (res.Item === undefined) return null
		return marshall(res.Item) as unknown as PersistedJob
	}

export const update =
	(db: DynamoDBClient, TableName: string) =>
	async (
		update: Pick<PersistedJob, 'status' | 'statusDetail'>,
		current: Pick<PersistedJob, 'deviceId' | 'timestamp'>,
	): Promise<void> => {
		const now = new Date().toISOString()
		if (update.status === FOTAJobStatus.NEW)
			throw new Error(`Cannot set status to NEW!`)
		if (update.status !== FOTAJobStatus.IN_PROGRESS) {
			const currentJob = await getByDeviceId(db, TableName)(current.deviceId)
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
					'SET #status = :status, #statusDetail = :statusDetail, #timestamp = :now',
				ExpressionAttributeNames: {
					'#status': 'status',
					'#statusDetail': 'statusDetail',
					'#timestamp': 'timestamp',
				},
				ExpressionAttributeValues: {
					':now': { S: now },
					':status': { S: update.status },
					':statusDetail': { S: update.statusDetail },
					':timestamp': { S: current.timestamp },
				},
				ConditionExpression: '#timestamp = :timestamp',
				ReturnValues: 'NONE',
			}),
		)
	}
