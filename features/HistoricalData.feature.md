# Historical messages

> Device messages should be stored in database

## Background

Given I have the fingerprint for a `PCA20035+solar` device in the `exeger`
account in `fingerprint`

## Verify a device sends a message to nRF Cloud, then I can query historical messages

Given I connect to the websocket using fingerprint `${fingerprint}`

And I store `$millis()` into `ts`

And I store `$fromMillis(${ts})` into `tsISO`

And the device `${fingerprint_deviceId}` publishes this message to the topic
`m/d/${fingerprint_deviceId}/d2c`

```json
{
  "appId": "SOLAR",
  "messageType": "DATA",
  "data": "3.123457",
  "ts": "$number{ts}"
}
```

When I query Timestream for the device `${fingerprint_deviceId}` and the
dimension `@context` with the value
`https://github.com/hello-nrfcloud/proto/transformed/PCA20035%2Bsolar/gain`
starting at `${tsISO}`

Then the Timestream result should match

```json
[
  {
    "deviceId": "${fingerprint_deviceId}",
    "@context": "https://github.com/hello-nrfcloud/proto/transformed/PCA20035%2Bsolar/gain",
    "measure_name": "mA",
    "measure_value::double": 3.123457,
    "time": "${tsISO}"
  }
]
```
