import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb'
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb'
import { identifyIssuer } from 'e118-iin-list'
import { readFileSync } from 'node:fs'

const db = new DynamoDBClient({})

for (const line of readFileSync('./iccids.csv', 'utf-8').split('\n')) {
	const [deviceId, iccid] = line.split(' ')

	const { Item } = await db.send(
		new GetItemCommand({
			TableName:
				'hello-nrfcloud-backend-DevicesTabledevicesTable87DE7A65-1CCQ7YDQXRWUB',
			Key: marshall({ deviceId }),
		}),
	)

	console.log(
		[
			deviceId,
			iccid,
			identifyIssuer(iccid ?? '')?.companyName ?? '??',
			unmarshall(Item ?? {}).lastSeen,
		].join('\t'),
	)
}
