---
exampleContext:
  fingerprint: 92b.y7i24q
  fingerprint_deviceId: oob-352656108602296
  APIURL: https://api.hello.nordicsemi.cloud
  ts: 1694503339523
---

# Device configuration

> A user can configure a device
>
> This will result in the nRF Cloud API for the device being called to configure
> the device state.

## Background

Given I have the fingerprint for a `PCA20065` device in `fingerprint`

## Turn the LED on

Given this nRF Cloud API request is queued for a
`PATCH /v1/devices/${fingerprint_deviceId}/state` request

```
HTTP/1.1 202 Accepted
```

And I store `$millis()` into `ts`

When I `PATCH`
`${APIURL}/device/${fingerprint_deviceId}/state?fingerprint=${fingerprint}` with

```json
{
  "@context": "https://github.com/hello-nrfcloud/proto/lwm2m/object/update",
  "ObjectID": 14240,
  "Resources": {
    "0": 255,
    "1": 255,
    "2": 255,
    "99": "$number{$floor(ts/1000)}"
  }
}
```

Then the status code of the last response should be `202`

Soon the nRF Cloud API should have been called with

```
PATCH /v1/devices/${fingerprint_deviceId}/state HTTP/1.1
Content-Type: application/json

{"desired":{"lwm2m":{"14240:1.0":{"0":{"0":255,"1":255,"2":255,"99":${$floor(ts/1000)}}}}}}
```

## Desired device configuration should be published on the websocket

When I connect to the websocket using fingerprint `${fingerprint}`

Soon I should receive a message on the websocket that matches

```json
{
  "@context": "https://github.com/hello-nrfcloud/proto/shadow",
  "desired": [
    {
      "ObjectID": 14240,
      "Resources": {
        "0": 255,
        "1": 255,
        "2": 255,
        "99": "$number{$floor(ts/1000)}"
      }
    }
  ]
}
```
