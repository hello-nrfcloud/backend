---
needs:
  - Sharing a device on the map
exampleContext:
  fingerprint: 92b.y7i24q
  fingerprint_deviceId: 33ec3829-895f-4265-a11f-6c617a2e6b87
  publicDeviceId: outfling-swanherd-attaghan
  now: 2023-09-12T00:00:00.000Z
  devicesAPI: "https://confirm-ownership.lambda-url.eu-west-1.on.aws/"
  ts: 1694503339523
  tsISO: 2023-09-12T00:00:00.000Z
---

# Resolve single-cell geo-locations for public devices

> Any device that publishes the LwM2M object 14203 (ConnectionInformation) will
> have its geo-location resolved based on the network information in this
> object.

## Background

Given I store `$now()` into `now`

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

## The devices publishes connection information

Given I store `$millis()` into `ts`

And I store `$fromMillis(${ts})` into `tsISO`

And the device `${fingerprint_deviceId}` publishes this message to the topic
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

When I `GET` `${devicesAPI}`

Then I should receive a `https://github.com/hello-nrfcloud/backend/map/devices`
response

And `$.devices[id="${publicDeviceId}"].state[ObjectID=14201]` of the last
response should match

```json
{
  "ObjectID": 14201,
  "ObjectVersion": "1.0",
  "ObjectInstanceID": 2,
  "Resources": {
    "0": 63.41999531,
    "1": 10.42999506,
    "3": 2420,
    "6": "SCELL",
    "99": "${tsISO}"
  }
}
```
