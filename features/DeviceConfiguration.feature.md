---
exampleContext:
  fingerprint: 92b.y7i24q
  fingerprint_deviceId: 33ec3829-895f-4265-a11f-6c617a2e6b87
  APIURL: https://r8hwx148u8.execute-api.eu-west-1.amazonaws.com/prod
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

Given this nRF Cloud API is queued for a
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
    "99": "$number{ts}"
  }
}
```

Then the status code of the last response should be `201`

Soon the nRF Cloud API should have been called with

```
PATCH /v1/devices/${fingerprint_deviceId}/state HTTP/1.1
Content-Type: application/json

{"desired":{"14240:1.0":{"0":{"0":255,"1":255,"2":255,"99":"$number{ts}"}}}}
```
