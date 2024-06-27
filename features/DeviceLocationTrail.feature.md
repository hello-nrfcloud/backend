---
exampleContext:
  trailDevice: 92b.y7i24q
  trailDevice_deviceId: oob-352656108602296
  ts: 1694503339523
  APIURL: https://api.hello.nordicsemi.cloud
  pastTsISO: 2023-09-12T00:00:00.000Z
  pageNextToken: some-token
  query: "&pageNextToken=some-token"
---

# Location trail

> In order to show a trail of coordinates the backend can provide the location
> history of the device. But because when a device is stationary, it can create
> a lot of GNSS fixes that are very close by, and this provides no meaningful
> data to show on the map, there is a feature that allows to reduce the GNSS
> location history to individual positions that are at least a certain amount
> apart.

## Background

Given I have the fingerprint for a `PCA20065` device in `trailDevice`

And I store `$millis()` into `ts`

## Scenario Outline: Device publishes location data

Given I store `$fromMillis(ts - ${deductMSFromTS})` into `pastTsISO`

And I have a random UUIDv4 in `id`

When this nRF Cloud API request is queued for a
`GET /v1/location/history?deviceId=${trailDevice_deviceId}${query = null ? '' : query}`
request

```
HTTP/1.1 200 OK
Content-Type: application/json

{
  "items": [
    {
      "deviceId": "${trailDevice_deviceId}",
      "id": "${id}",
      "insertedAt": "${pastTsISO}",
      "lat": "${lat}",
      "lon": "${lon}",
      "meta": {},
      "serviceType": "GNSS",
      "uncertainty": "20"
    }
  ],
  "total": 1,
  "${pageNextToken = null ? '_': 'pageNextToken'}": "${pageNextToken = null ? '': pageNextToken}"
}

```

### Examples

| location                           | lat                | lon                | deductMSFromTS | pageNextToken | query            |
| ---------------------------------- | ------------------ | ------------------ | -------------- | ------------- | ---------------- |
| Leistadkrysset                     | 63.42254450323275  | 10.630926224360818 | 1000           | a             |                  |
| Ranheim Papirfabrikk               | 63.42215444775618  | 10.535387671151794 | 2000           | b             | &pageNextToken=a |
| Tyholtårnet                        | 63.42237916512731  | 10.431970701200813 | 4000           | d             | &pageNextToken=c |
| E6 to the east                     | 63.43076160883743  | 10.487144544169565 | 3000           | c             | &pageNextToken=b |
| Roundabout ~250m to the north east | 63.42394407014264  | 10.440180476283883 | 5000           | e             | &pageNextToken=d |
| Roundabout 100m to the south west  | 63.419843636135205 | 10.436831426327439 | 6000           | f             | &pageNextToken=e |
| Nordic Office                      | 63.42198706744704  | 10.437808861037931 | 7000           |               | &pageNextToken=f |

## Retrieve location trail

> For observed devices, the history is fetched, and made available for querying

Given I connect to the websocket using fingerprint `${trailDevice}`

> The last location should be published

Soon I should receive a message on the websocket that matches after 20 retries

```json
{
  "@context": "https://github.com/hello-nrfcloud/proto/lwm2m/object/update",
  "ObjectID": 14201,
  "ObjectInstanceID": 0,
  "Resources": {
    "0": 63.42254450323275,
    "1": 10.630926224360818,
    "3": 20,
    "6": "GNSS",
    "99": "$number{$floor(ts/1000)-1}"
  }
}
```

When I `GET`
`${APIURL}/device/${trailDevice_deviceId}/history/14201/0?fingerprint=${trailDevice}&trail=1`

Soon I should receive a
`https://github.com/hello-nrfcloud/proto/lwm2m/object/history` response

And `$.query` of the last response should match

```json
{
  "ObjectID": 14201,
  "ObjectVersion": "1.0",
  "ObjectInstanceID": 0,
  "deviceId": "${trailDevice_deviceId}",
  "binIntervalMinutes": 1
}
```

And `{"len": $count($.partialInstances)}` of the last response should match

```json
{ "len": 4 }
```

And `$.partialInstances[0]` of the last response should match

```json
{
  "0": 63.42198706744704,
  "1": 10.437808861037931,
  "3": 293.7028058347316,
  "6": "GNSS",
  "99": "$number{$floor(ts/1000) - 7}"
}
```

And `$.partialInstances[1]` of the last response should match

```json
{
  "0": 63.43076160883743,
  "1": 10.487144544169565,
  "3": 0,
  "6": "GNSS",
  "99": "$number{$floor(ts/1000) - 3}"
}
```

And `$.partialInstances[2]` of the last response should match

```json
{
  "0": 63.42215444775618,
  "1": 10.535387671151794,
  "3": 0,
  "6": "GNSS",
  "99": "$number{$floor(ts/1000) - 2}"
}
```

And `$.partialInstances[3]` of the last response should match

```json
{
  "0": 63.42254450323275,
  "1": 10.630926224360818,
  "3": 0,
  "6": "GNSS",
  "99": "$number{$floor(ts/1000) - 1}"
}
```
