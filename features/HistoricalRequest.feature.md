# Historical data request

> A client can request the history for the device.

## Background

Given I have the fingerprint for a `PCA20035+solar` device in `fingerprint`

And I store
`$toMillis($fromMillis($millis(), '[Y9999]-[M99]-[D99]T[H99]:[m]:00Z'))` into
`ts`

## Scenario Outline: Device publishes the messages to nRF Cloud

Given I store `ts - ${deductMsFromTS}` into `pastTs`

And the device `${fingerprint:deviceId}` publishes this message to the topic
`m/d/${fingerprint:deviceId}/d2c`

```json
{
  "appId": "${appId}",
  "messageType": "DATA",
  "data": "${data}",
  "ts": ${pastTs}
}
```

### Examples

| appId | data    | deductMsFromTS |
| ----- | ------- | -------------- |
| SOLAR | 3.40141 | 0              |
| SOLAR | 3.75718 | 30000          |
| SOLAR | 3.73368 | 60000          |
| SOLAR | 3.58041 | 90000          |
| SOLAR | 3.24925 | 120000         |

## Verify I can query historical device data

When I connect to the websocket using fingerprint `${fingerprint}`

And I send websocket request

```json
{
  "message": "message",
  "payload": {
    "@context": "https://github.com/hello-nrfcloud/proto/historical-data-request",
    "@id": "420eac59-5ce8-4751-b7d1-217811382095",
    "type": "lastHour",
    "message": "gain",
    "attributes": {
      "avgMA": { "attribute": "mA", "aggregate": "avg" }
    }
  }
}
```

<!-- @retry:tries=10,initialDelay=1000,delayFactor=2 -->

Soon I should receive a message on the websocket that is equal to

```json
{
  "@context": "https://github.com/hello-nrfcloud/proto/transformed/PCA20035%2Bsolar/historical-data",
  "@id": "420eac59-5ce8-4751-b7d1-217811382095",
  "attributes": {
    "avgMA": [
      {
        "mA": 3.40141,
        "ts": `ts`
      },
      {
        "mA": 3.74543,
        "ts": `ts - 60000`
      },
      {
        "mA": 3.4148300000000003,
        "ts": `ts - 120000`
      }
    ]
  }
}
```
