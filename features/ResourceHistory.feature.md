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

Given I have the fingerprint for a `PCA20065` device in `fingerprint`

Given I store `$millis()` into `ts`

And I store `$fromMillis(${ts})` into `tsISO`

## Scenario Outline: Device publishes data

Given I store `ts - ${deductMsFromTS}` into `pastTs`

When the device `${fingerprint_deviceId}` does a `POST` to this CoAP resource
`/msg/d2c/raw` with this SenML payload

```json
[
  {
    "bn": "14202/0/",
    "bt": "$number{pastTs}",
    "n": "1",
    "v": "$number{v}"
  }
]
```

### Examples

| v       | deductMsFromTS |
| ------- | -------------- |
| 3.40141 | 0              |
| 3.75718 | 30000          |
| 3.73368 | 60000          |
| 3.58041 | 90000          |
| 3.24925 | 120000         |

## Fetch the published data

When I `GET`
`${APIURL}/device/${fingerprint_deviceId}/history/14202/0?fingerprint=${fingerprint}&timeSpan=lastDay`

Then I should receive a
`https://github.com/hello-nrfcloud/proto/lwm2m/object/history` response

And `$.query` of the last response should match

```json
{
  "ObjectID": 14202,
  "ObjectVersion": "1.0",
  "ObjectInstanceID": 0,
  "deviceId": "${fingerprint_deviceId}",
  "binIntervalMinutes": 15
}
```

And `$.partialInstances[0]` of the last response should match

```json
{
  "1": 3.5443860000000003
}
```
