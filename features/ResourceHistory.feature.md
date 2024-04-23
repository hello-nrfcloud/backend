---
exampleContext:
  fingerprint: 92b.y7i24q
  fingerprint_deviceId: 33ec3829-895f-4265-a11f-6c617a2e6b87
  ts: 1694503339523
  tsISO: 2023-09-12T00:00:00.000Z
  APIURL: https://r8hwx148u8.execute-api.eu-west-1.amazonaws.com/prod
---

# History can be fetched for numeric LwM2M object resources

## Background

Given I have the fingerprint for a `PCA20035+solar` device in `fingerprint`

## Device publishes data

Given I store `$millis()` into `ts`

And I store `$fromMillis(${ts})` into `tsISO`

When the device `${fingerprint_deviceId}` does a `POST` to this CoAP resource
`/msg/d2c/raw` with this SenML payload

```json
[
  {
    "bn": "14201/0/",
    "bt": "$number{ts}",
    "n": "0",
    "v": 62.469414
  },
  { "n": "1", "v": 6.151946 },
  { "n": "3", "v": 1 },
  { "n": "6", "vs": "Fixed" }
]
```

## Fetch the published data

When I `GET`
`${APIURL}/device/${fingerprint_deviceId}/history/14230/0?fingerprint=${fingerprint}`

Then I should receive a
`https://github.com/hello-nrfcloud/proto-map/history/resource` response

And `$.query` of the last response should match

```json
{
  "ObjectID": 14230,
  "ObjectVersion": "1.0",
  "ObjectInstanceID": 0,
  "deviceId": "${fingerprint_deviceId}",
  "binIntervalMinutes": 15
}
```

And `$.partialInstances[0]` of the last response should match

```json
{
  "0": 225.1,
  "99": "$number{ts}"
}
```
