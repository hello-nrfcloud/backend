# Historical data request

> A client can request the history for the device.

## Background

Given I have the fingerprint for a `PCA20035+solar` device in `fingerprint`

And I store
`$toMillis($fromMillis($millis(), '[Y9999]-[M99]-[D99]T[H99]:[m]:00Z'))` into
`ts`

## Scenario Outline: Device publishes the gain messages to nRF Cloud

Given I store `ts - ${deductMsFromTS}` into `pastTs`

And the device `${fingerprint_deviceId}` publishes this message to the topic
`m/d/${fingerprint_deviceId}/d2c`

```json
{
  "appId": "${appId}",
  "messageType": "DATA",
  "data": "${data}",
  "ts": "$number{pastTs}"
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

## Verify I can query gain historical device data

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

Soon I should receive a message on the websocket that is equal to

```json
{
  "@context": "https://github.com/hello-nrfcloud/proto/historical-data-response",
  "@id": "420eac59-5ce8-4751-b7d1-217811382095",
  "attributes": {
    "avgMA": [
      {
        "mA": 3.40141,
        "ts": "$number{ts}"
      },
      {
        "mA": 3.74543,
        "ts": "$number{ts - 60000}"
      },
      {
        "mA": 3.4148300000000003,
        "ts": "$number{ts - 120000}"
      }
    ]
  }
}
```

## Scenario Outline: Device publishes the battery messages to nRF Cloud

Given I store `ts - ${deductMsFromTS}` into `pastTs`

And the device `${fingerprint_deviceId}` publishes this message to the topic
`m/d/${fingerprint_deviceId}/d2c`

```json
{
  "appId": "${appId}",
  "messageType": "DATA",
  "data": "${data}",
  "ts": "$number{pastTs}"
}
```

### Examples

| appId   | data | deductMsFromTS |
| ------- | ---- | -------------- |
| BATTERY | 18   | 0              |
| BATTERY | 19   | 30000          |
| BATTERY | 20   | 60000          |
| BATTERY | 21   | 90000          |
| BATTERY | 22   | 120000         |

## Verify I can query battery historical device data

When I connect to the websocket using fingerprint `${fingerprint}`

And I send websocket request

```json
{
  "message": "message",
  "payload": {
    "@context": "https://github.com/hello-nrfcloud/proto/historical-data-request",
    "@id": "b42b7880-0217-484f-8e72-380950ffae46",
    "type": "lastHour",
    "message": "battery",
    "attributes": {
      "minBat": { "attribute": "%", "aggregate": "min" },
      "maxBat": { "attribute": "%", "aggregate": "max" }
    }
  }
}
```

<!-- @retry:tries=5,initialDelay=1000,delayFactor=2 -->

Soon I should receive a message on the websocket that is equal to

```json
{
  "@context": "https://github.com/hello-nrfcloud/proto/historical-data-response",
  "@id": "b42b7880-0217-484f-8e72-380950ffae46",
  "attributes": {
    "minBat": [
      {
        "%": 18,
        "ts": "$number{ts}"
      },
      {
        "%": 19,
        "ts": "$number{ts - 60000}"
      },
      {
        "%": 21,
        "ts": "$number{ts - 120000}"
      }
    ],
    "maxBat": [
      {
        "%": 18,
        "ts": "$number{ts}"
      },
      {
        "%": 20,
        "ts": "$number{ts - 60000}"
      },
      {
        "%": 22,
        "ts": "$number{ts - 120000}"
      }
    ]
  }
}
```

## Verify I will get error message if the request is invalid

When I connect to the websocket using fingerprint `${fingerprint}`

And I send websocket request

```json
{
  "message": "message",
  "payload": {
    "@context": "https://github.com/hello-nrfcloud/proto/historical-data-request",
    "@id": "0c0123ff-f03d-4fc4-934e-0bf1edb7c304",
    "type": "lastHour",
    "message": "unknown",
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
  "@context": "https://github.com/hello-nrfcloud/proto/ProblemDetail",
  "@id": "0c0123ff-f03d-4fc4-934e-0bf1edb7c304",
  "type": "https://hello.nrfcloud.com/errors/BadRequest",
  "status": 400,
  "title": "Invalid request"
}
```

## Scenario Outline: Write data into Timestream

Given I store `ts - ${deductMsFromTS}` into `pastTs`

And I write Timestream for the device `${fingerprint_deviceId}` with this
message

```json
{
  "@context": "https://github.com/hello-nrfcloud/proto/transformed/PCA20035%2Bsolar/location",
  "lat": "$number{lat}",
  "lng": "$number{lng}",
  "acc": "$number{acc}",
  "ts": "$number{pastTs}"
}
```

### Examples

| lat         | lng         | acc | deductMsFromTS |
| ----------- | ----------- | --- | -------------- |
| 63.42061758 | 10.43935061 | 526 | 0              |
| 63.41879947 | 10.44127392 | 530 | 30000          |
| 63.41984024 | 10.43768981 | 520 | 60000          |
| 63.42006573 | 10.44087654 | 528 | 90000          |
| 63.42129386 | 10.44011945 | 524 | 120000         |

## Verify I can query location historical device data

When I connect to the websocket using fingerprint `${fingerprint}`

And I send websocket request

```json
{
  "message": "message",
  "payload": {
    "@context": "https://github.com/hello-nrfcloud/proto/historical-data-request",
    "@id": "ce324e8e-2aac-4525-b763-5c036148c167",
    "type": "lastHour",
    "message": "location",
    "attributes": {
      "lat": { "attribute": "lat" },
      "lng": { "attribute": "lng" },
      "acc": { "attribute": "acc" },
      "ts": { "attribute": "ts" }
    }
  }
}
```

<!-- @retry:tries=5,initialDelay=1000,delayFactor=2 -->

Soon I should receive a message on the websocket that matches

```json
{
  "@context": "https://github.com/hello-nrfcloud/proto/historical-data-response",
  "@id": "ce324e8e-2aac-4525-b763-5c036148c167",
  "attributes": [
    {
      "lat": 63.42061758,
      "lng": 10.43935061,
      "acc": 526,
      "ts": "$number{ts}"
    },
    {
      "lat": 63.41879947,
      "lng": 10.44127392,
      "acc": 530,
      "ts": "$number{ts - 30000}"
    },
    {
      "lat": 63.41984024,
      "lng": 10.43768981,
      "acc": 520,
      "ts": "$number{ts - 60000}"
    },
    {
      "lat": 63.42006573,
      "lng": 10.44087654,
      "acc": 528,
      "ts": "$number{ts - 90000}"
    },
    {
      "lat": 63.42129386,
      "lng": 10.44011945,
      "acc": 524,
      "ts": "$number{ts - 120000}"
    }
  ]
}
```
