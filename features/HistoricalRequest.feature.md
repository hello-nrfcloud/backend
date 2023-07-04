# Historical data request

> A client can request the history for the device.

## Background

Given I have the fingerprint for a `PCA20035+solar` device in `fingerprint`

And I store
`$toMillis($fromMillis($millis(), '[Y9999]-[M99]-[D99]T[H99]:[m]:00Z'))` into
`ts`

## Scenario Outline: Device publishes the messages to nRF Cloud

Given I store `ts - ${deductMsFromTS}` into `${storeName}`

Then the device `${fingerprint:deviceId}` publishes the message with properties
`${appId}`, `${messageType}`, `${data}`, and `${storeName}` to the topic
`m/d/${fingerprint:deviceId}/d2c`

### Examples

| appId | messageType | data    | deductMsFromTS | storeName |
| ----- | ----------- | ------- | -------------- | --------- |
| SOLAR | DATA        | 3.40141 | 0              | ts1       |
| SOLAR | DATA        | 3.75718 | 30000          | ts2       |
| SOLAR | DATA        | 3.73368 | 60000          | ts3       |
| SOLAR | DATA        | 3.58041 | 90000          | ts4       |
| SOLAR | DATA        | 3.24925 | 120000         | ts5       |

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

<!-- @retry:tries=5,initialDelay=1000,delayFactor=2 -->

Soon I should receive a message on the websocket that matches

```json
{
  "@context": "https://github.com/hello-nrfcloud/proto/transformed/PCA20035%2Bsolar/historical-data",
  "@id": "420eac59-5ce8-4751-b7d1-217811382095",
  "attributes": {
    "avgMA": [
      {
        "mA": 3.40141,
        "ts": ${ts1}
      },
      {
        "mA": 3.74543,
        "ts": ${ts3}
      },
      {
        "mA": 3.4148300000000003,
        "ts": ${ts5}
      }
    ]
  }
}
```
