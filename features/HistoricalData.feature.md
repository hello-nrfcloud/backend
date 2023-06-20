# Historical messages

> Device messages should be stored in database

## Background

Given a `PCA20035+solar` device with the ID `nrf-historical-device-id` is
registered with the fingerprint `2a.d795c7`

## Verify a device sends a message to nRF Cloud, then I can query historical messages

Given I connect websocket with fingerprint `2a.d795c7`

And I store `$millis()` into `ts`

And I store `$fromMillis(${ts})` into `tsISO`

When a device with id `nrf-historical-device-id` publishes to topic
`m/d/nrf-historical-device-id/d2c` with a message as this JSON

```json
{
  "appId": "SOLAR",
  "messageType": "DATA",
  "data": "3.123457",
  "ts": ${ts}
}
```

Then I query timestream for the device `nrf-historical-device-id` and the
dimension `@context` with the value
`https://github.com/hello-nrfcloud/proto/transformed/PCA20035%2Bsolar/gain` from
`${tsISO}`. The response should match this JSON

```json
[
  {
    "deviceId": "nrf-historical-device-id",
    "@context": "https://github.com/hello-nrfcloud/proto/transformed/PCA20035%2Bsolar/gain",
    "measure_name": "mA",
    "measure_value::double": 3.123457,
    "time": "${tsISO}"
  }
]
```
