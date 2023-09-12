---
exampleContext:
  fingerprint: 92b.y7i24q
  fingerprint_deviceId: 33ec3829-895f-4265-a11f-6c617a2e6b87
  now: 2023-09-12T00:00:00.000Z
---

# Single-cell geo location

> The network information sent by the device as part of the `DEVICE` message
> should be used to determine the approximate device location.

## Background

Given I have the fingerprint for a `PCA20035+solar` device in `fingerprint`

And I connect to the websocket using fingerprint `${fingerprint}`

And I store `$now()` into `now`

And this nRF Cloud API is queued for a `GET /v1/account/service-token` request

```
HTTP/1.1 200 OK
Content-Type: application/json

{
  "createdAt": "${now}",
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

<!-- @retry:delayExecution=5000 -->

## Device publishes network information, which is then resolved

Given I store `$millis()` into `ts`

When the device `${fingerprint_deviceId}` publishes this message to the topic
`m/d/${fingerprint_deviceId}/d2c`

```json
{
  "appId": "DEVICE",
  "messageType": "DATA",
  "ts": "$number{ts}",
  "data": {
    "networkInfo": {
      "currentBand": 20,
      "networkMode": "LTE-M",
      "rsrp": -102,
      "areaCode": 2305,
      "mccmnc": 24202,
      "cellID": 34237196,
      "ipAddress": "100.74.127.55",
      "eest": 7
    }
  }
}
```

<!-- @retryScenario -->

Soon I should receive a message on the websocket that matches

```json
{
  "@context": "https://github.com/hello-nrfcloud/proto/transformed/PCA20035%2Bsolar/location",
  "lat": 63.41999531,
  "lng": 10.42999506,
  "acc": 2420,
  "ts": "$number{ts}",
  "src": "SCELL"
}
```

<!-- @retryScenario -->

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
      "eci": 34237196,
      "tac": 2305,
      "rsrp": -102
    }
  ]
}
```

<!-- @retry:delayExecution=5000 -->

## Device publishes network information, which is then resolved

> The next message will be resolved without an additional call to the nRF Cloud
> API.

Given I store `$millis()` into `ts`

When the device `${fingerprint_deviceId}` publishes this message to the topic
`m/d/${fingerprint_deviceId}/d2c`

```json
{
  "appId": "DEVICE",
  "messageType": "DATA",
  "ts": "$number{ts}",
  "data": {
    "networkInfo": {
      "currentBand": 20,
      "networkMode": "LTE-M",
      "rsrp": -102,
      "areaCode": 2305,
      "mccmnc": 24202,
      "cellID": 34237196,
      "ipAddress": "100.74.127.55",
      "eest": 7
    }
  }
}
```

<!-- @retryScenario -->

Soon I should receive a message on the websocket that matches

```json
{
  "@context": "https://github.com/hello-nrfcloud/proto/transformed/PCA20035%2Bsolar/location",
  "lat": 63.41999531,
  "lng": 10.42999506,
  "acc": 2420,
  "ts": "$number{ts}",
  "src": "SCELL"
}
```
