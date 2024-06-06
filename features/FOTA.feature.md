---
exampleContext:
  fingerprint: 92b.y7i24q
  fingerprint_deviceId: 33ec3829-895f-4265-a11f-6c617a2e6b87
  APIURL: https://r8hwx148u8.execute-api.eu-west-1.amazonaws.com/prod
  ts: 1694503339523
  tsISO: 2023-09-12T00:00:00.000Z
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

And I store `$millis()` into `ts`

And I store `$fromMillis(${ts})` into `tsISO`

And this nRF Cloud API is queued for a `POST /v1/fota-jobs` request

```
HTTP/1.1 200 OK
Content-Type: application/json

{"jobId": "${jobId}"}
```

And this nRF Cloud API is queued for a `GET /v1/fota-jobs/${jobId}` request

```
HTTP/1.1 200 OK
Content-Type: application/json

{
    "createdAt": "${tsISO}",
    "executionStats": {
        "cancelled": 0,
        "completedExecutions": 0,
        "devices": 1,
        "downloading": 0,
        "executions": 1,
        "failed": 0,
        "inProgress": 0,
        "queued": 1,
        "rejected": 0,
        "removed": 0,
        "succeeded": 0,
        "timedOut": 0
    },
    "firmware": {
        "bundleId": "APP*1e29dfa3*v2.0.0",
        "fileSize": 425860,
        "firmwareType": "APP",
        "host": "firmware.nrfcloud.com",
        "uris": [
            "bbfe6b73-a46a-43ad-94bd-8e4b4a7847ce/APP*1e29dfa3*v2.0.0/hello-nrfcloud-thingy91x-v2.0.0-fwupd.bin"
        ],
        "version": "v2.0.0"
    },
    "jobId": "${jobId}",
    "lastUpdatedAt": "${tsISO}",
    "name": "${jobId}",
    "status": "IN_PROGRESS",
    "statusDetail": "Job auto applied",
    "target": {
        "deviceIds": [
            "${fingerprint_deviceId}"
        ],
        "tags": []
    }
}
```

## Schedule the FOTA job

When I `POST`
`${APIURL}/device/${fingerprint_deviceId}/fota?fingerprint=${fingerprint}` with

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

{"bundleId":"APP*1e29dfa3*v2.0.0","autoApply":true,"deviceIdentifiers":["${fingerprint_deviceId}"]}
```

## Check the status

When I `GET`
`${APIURL}/device/${fingerprint_deviceId}/fota/jobs?fingerprint=${fingerprint}`
retrying 10 times

Soon I should receive a
`https://github.com/hello-nrfcloud/proto/fota/job-executions` response

And `$.jobs[0]` of the last response should match

```json
{
  "id": "${jobId}",
  "deviceId": "${fingerprint_deviceId}",
  "status": "IN_PROGRESS",
  "statusDetail": "Job auto applied",
  "lastUpdatedAt": "${tsISO}",
  "version": "v2.0.0"
}
```
