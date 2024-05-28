---
exampleContext:
  fingerprint: 92b.y7i24q
  fingerprint_deviceId: 33ec3829-895f-4265-a11f-6c617a2e6b87
  tsISO: 2023-09-12T00:00:00.000Z
  ts: 1694503339523
  ts2: 1694503339523
---

# Single-cell geo location

> The network information sent by the device should be used to determine the
> approximate device location.

## Background

Given I have the fingerprint for a `PCA20065` device in `fingerprint`

And I connect to the websocket using fingerprint `${fingerprint}`

And I store `$millis()` into `ts`

And I store `$fromMillis(${ts})` into `tsISO`

And I have a random cellId in `cellId`

And this nRF Cloud API is queued for a `GET /v1/account/service-token` request

```
HTTP/1.1 200 OK
Content-Type: application/json

{
  "createdAt": "${tsISO}",
  "token": "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE2MzU0NDQ2NDAsImlhdCI6MTYzMjg1MjY1NCwic3ViIjoibnJmY2xvdWQtZXZhbHVhdGlvbi1kZXZpY2UtM2JmNTBlY2YtMmY3Zi00NjlmLTg4YTQtMmFhODhiZGMwODNiIn0.ldxPFg7xofD8gxjRkdu8WXl-cD01wVqn-VhvhyeuEXMeAmFpDHbSxEo5rs1DofEougUQnZy31T-e_5EQ8rlNMg"
}
```

And this nRF Cloud API is queued for a `POST /v1/location/ground-fix` request

```
HTTP/1.1 200 OK
Content-Type: application/json

{
  "lat": 63.41999531,
  "lon": 10.42999506,
  "uncertainty": 2420,
  "fulfilledWith": "SCELL"
}
```

## Device publishes network information, which is then resolved

When the device `${fingerprint_deviceId}` does a `POST` to this CoAP resource
`/msg/d2c/raw` with this SenML payload

```json
[
  {
    "bn": "14203/0/",
    "n": "0",
    "vs": "LTE-M",
    "bt": "$number{ts}"
  },
  {
    "n": "1",
    "v": 20
  },
  {
    "n": "2",
    "v": -102
  },
  {
    "n": "3",
    "v": 2305
  },
  {
    "n": "4",
    "v": "$number{cellId}"
  },
  {
    "n": "5",
    "v": 24202
  },
  {
    "n": "6",
    "vs": "100.74.127.55"
  },
  {
    "n": "11",
    "v": 7
  }
]
```

Soon I should receive a message on the websocket that matches

```json
{
  "@context": "https://github.com/hello-nrfcloud/proto/lwm2m/object/update",
  "ObjectID": 14203,
  "Resources": {
    "0": "LTE-M",
    "1": 20,
    "2": -102,
    "3": 2305,
    "4": "$number{cellId}",
    "5": 24202,
    "6": "100.74.127.55",
    "11": 7,
    "99": "$number{ts}"
  }
}
```

Soon the nRF Cloud API should have been called with

```
POST /v1/location/ground-fix HTTP/1.1
Content-Type: application/json
Authorization: Bearer eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjE2MzU0NDQ2NDAsImlhdCI6MTYzMjg1MjY1NCwic3ViIjoibnJmY2xvdWQtZXZhbHVhdGlvbi1kZXZpY2UtM2JmNTBlY2YtMmY3Zi00NjlmLTg4YTQtMmFhODhiZGMwODNiIn0.ldxPFg7xofD8gxjRkdu8WXl-cD01wVqn-VhvhyeuEXMeAmFpDHbSxEo5rs1DofEougUQnZy31T-e_5EQ8rlNMg

{
  "lte": [
    {
      "mcc": 242,
      "mnc": "02",
      "eci": ${cellId},
      "tac": 2305,
      "rsrp": -102
    }
  ]
}
```

Soon I should receive a message on the websocket that matches

```json
{
  "@context": "https://github.com/hello-nrfcloud/proto/lwm2m/object/update",
  "ObjectID": 14201,
  "Resources": {
    "0": 63.41999531,
    "1": 10.42999506,
    "3": 2420,
    "6": "SCELL",
    "99": "$number{ts}"
  }
}
```

## Device publishes network information, which is then resolved

> The next message will be resolved without an additional call to the nRF Cloud
> API.

Given I store `$millis()` into `ts2`

When the device `${fingerprint_deviceId}` does a `POST` to this CoAP resource
`/msg/d2c/raw` with this SenML payload

```json
[
  {
    "bn": "14203/0/",
    "n": "0",
    "vs": "LTE-M",
    "bt": "$number{ts2}"
  },
  {
    "n": "1",
    "v": 20
  },
  {
    "n": "2",
    "v": -102
  },
  {
    "n": "3",
    "v": 2305
  },
  {
    "n": "4",
    "v": "$number{cellId}"
  },
  {
    "n": "5",
    "v": 24202
  },
  {
    "n": "6",
    "vs": "100.74.127.45"
  },
  {
    "n": "11",
    "v": 6
  }
]
```

Soon I should receive a message on the websocket that matches

```json
{
  "@context": "https://github.com/hello-nrfcloud/proto/lwm2m/object/update",
  "ObjectID": 14203,
  "Resources": {
    "0": "LTE-M",
    "1": 20,
    "2": -102,
    "3": 2305,
    "4": "$number{cellId}",
    "5": 24202,
    "6": "100.74.127.45",
    "11": 6,
    "99": "$number{ts2}"
  }
}
```

Soon I should receive a message on the websocket that matches

```json
{
  "@context": "https://github.com/hello-nrfcloud/proto/lwm2m/object/update",
  "ObjectID": 14201,
  "Resources": {
    "0": 63.41999531,
    "1": 10.42999506,
    "3": 2420,
    "6": "SCELL",
    "99": "$number{ts2}"
  }
}
```

## The single cell geo location should be persisted in the device shadow

Given I reconnect to the websocket using fingerprint `${fingerprint}`

Soon I should receive a message on the websocket that matches

```json
{
  "@context": "https://github.com/hello-nrfcloud/proto/shadow",
  "reported": [
    {
      "ObjectID": 14201,
      "ObjectInstanceID": 2,
      "Resources": {
        "0": 63.41999531,
        "1": 10.42999506,
        "3": 2420,
        "6": "SCELL",
        "99": "$number{ts2}"
      }
    }
  ]
}
```
