---
exampleContext:
  fingerprint: 92b.y7i24q
  fingerprint_deviceId: 33ec3829-895f-4265-a11f-6c617a2e6b87
  APIURL: https://r8hwx148u8.execute-api.eu-west-1.amazonaws.com/prod
  ts: 1694503339523
  jobId: bc631093-7f7c-4c1b-aa63-a68c759bcd5c
---

# Device FOTA

> A user can schedule a firmware update for a device.
>
> The bundleId provided by the web application, which provides the user with a
> list of suitable bundles for their device.

## Background

Given I have the fingerprint for a `PCA20065` device in `fingerprint`

And I have a random UUIDv4 in `jobId`

## Schedule the FOTA job

Given this nRF Cloud API is queued for a `POST /v1/fota-jobs` request

```
HTTP/1.1 200 OK
Content-Type: application/json

{"jobId": "${jobId}"}
```

And I store `$millis()` into `ts`

When I `PATCH`
`${APIURL}/device/${fingerprint_deviceId}/firmware?fingerprint=${fingerprint}`
with

```json
{
  "bundleId": "APP*1e29dfa3*v2.0.0"
}
```

Then the status code of the last response should be `202`

Soon the nRF Cloud API should have been called with

```
POST /v1/fota-jobs HTTP/1.1
Content-Type: application/json

{"bundleId":"APP*1e29dfa3*v2.0.0","autoApply":true,"deviceIds":["${fingerprint_deviceId}"]}
```
