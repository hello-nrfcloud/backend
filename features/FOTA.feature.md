---
exampleContext:
  fingerprint: 92b.y7i24q
  fingerprint_deviceId: oob-352656108602296
  APIURL: https://api.hello.nordicsemi.cloud
  ts: 1694503339523
  tsISO: 2023-09-12T00:00:00.000Z
  ts2: 1694503339523
  ts2ISO: 2023-09-12T00:00:00.000Z
  jobId: bc631093-7f7c-4c1b-aa63-a68c759bcd5c
---

# Device FOTA

> A user can schedule a firmware update for a device.
>
> In order for device to be able to receive updates from nRF Cloud, they have to
> report the supported FOTA types.
>
> Firmware update over the air (FOTA) is implemented using the nRF Cloud
> [FOTA Service](https://docs.nordicsemi.com/bundle/nrf-cloud/page/Devices/FirmwareUpdate/FOTAOverview.html).
>
> From a user perspective this is abstracted away behind two actions:
>
> 1. update the application firmware version to the latest version
> 2. update the modem firmware version to the the latest version
>
> However in practice this means that the web application issues a request with
> "upgrade" path, which is a per-model recipe defined in the
> [web application project](https://github.com/hello-nrfcloud/web/tree/saga/content/models)
> that describes the update routine.
>
> An update routine consists of one or more update jobs to execute to upgrade
> the device from one (modem) firmware version to another.

## Background

Given I have the fingerprint for a `PCA20065` device in `fingerprint`

And I have a random UUIDv4 in `jobId`

And I store `$millis()` into `ts`

And I store `$fromMillis(${ts})` into `tsISO`

And I store `$millis() + 30 * 1000` into `ts2`

And I store `$fromMillis(${ts2})` into `ts2ISO`

<!-- Devices have to report that they support FOTA. -->

And there is this device shadow data for `${fingerprint_deviceId}` in nRF Cloud

```json
{
  "items": [
    {
      "id": "${fingerprint_deviceId}",
      "$meta": {
        "createdAt": "${$fromMillis($millis())}",
        "updatedAt": "${$fromMillis($millis())}"
      },
      "state": {
        "reported": {
          "device": {
            "deviceInfo": {
              "appVersion": "2.0.0"
            },
            "serviceInfo": {
              "fota_v2": ["BOOT", "MODEM", "APP"]
            }
          }
        },
        "metadata": {
          "reported": {
            "device": {
              "deviceInfo": {
                "appVersion": { "timestamp": 1716801888 }
              },
              "serviceInfo": {
                "fota_v2": [
                  {
                    "timestamp": 1717409966
                  },
                  {
                    "timestamp": 1717409966
                  },
                  {
                    "timestamp": 1717409966
                  }
                ]
              }
            }
          }
        },
        "version": 8835
      }
    }
  ],
  "total": 1
}
```

<!-- This is the response nRF Cloud returns on job creation. -->

And this nRF Cloud API request is queued for a `POST /v1/fota-jobs` request

```
HTTP/1.1 200 OK
Content-Type: application/json

{"jobId": "${jobId}"}
```

<!-- Backend fetches details about the job. -->

And this nRF Cloud API request is queued for a `GET /v1/fota-jobs/${jobId}`
request

```
HTTP/1.1 200 OK
Content-Type: application/json

{
    "createdAt": "${tsISO}",
    "firmware": {
        "bundleId": "APP*1e29dfa3*v2.0.1",
        "fileSize": 425860,
        "firmwareType": "APP",
        "host": "firmware.nrfcloud.com",
        "uris": [
            "bbfe6b73-a46a-43ad-94bd-8e4b4a7847ce/APP*1e29dfa3*v2.0.1/hello-nrfcloud-thingy91x-v2.0.1-fwupd.bin"
        ],
        "version": "v2.0.1"
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

## The device reports that it is eligible for FOTA

Given I connect to the websocket using fingerprint `${fingerprint}`

Soon I should receive a message on the websocket that matches after 20 retries

```json
{
  "@context": "https://github.com/hello-nrfcloud/proto/shadow",
  "reported": [
    {
      "ObjectID": 14401,
      "Resources": {
        "0": ["BOOT", "MODEM", "APP"],
        "99": 1717409966
      }
    }
  ]
}
```

## Schedule the FOTA job

> This is the most simple example, it defines an upgrade path from version 2.0.0
> (the key of the object) to 2.0.1 (the bundle ID).

When I `POST`
`${APIURL}/device/${fingerprint_deviceId}/fota/app?fingerprint=${fingerprint}`
with

```json
{
  "upgradePath": {
    "2.0.0": "APP*1e29dfa3*v2.0.1"
  }
}
```

Then the status code of the last response should be `201`

And I should receive a
`https://github.com/hello-nrfcloud/proto/fota/job-execution` response

Soon the nRF Cloud API should have been called with

```
POST /v1/fota-jobs HTTP/1.1
Content-Type: application/json

{"bundleId":"APP*1e29dfa3*v2.0.1","autoApply":true,"deviceIdentifiers":["${fingerprint_deviceId}"]}
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
  "version": "v2.0.1"
}
```

## Job completes

> The job is marked as completed by nRF Cloud

Given this nRF Cloud API request is queued for a `GET /v1/fota-jobs/${jobId}`
request

```
HTTP/1.1 200 OK
Content-Type: application/json

{
    "createdAt": "${tsISO}",
    "firmware": {
        "bundleId": "APP*1e29dfa3*v2.0.1",
        "fileSize": 425860,
        "firmwareType": "APP",
        "host": "firmware.nrfcloud.com",
        "uris": [
            "bbfe6b73-a46a-43ad-94bd-8e4b4a7847ce/APP*1e29dfa3*v2.0.1/hello-nrfcloud-thingy91x-v2.0.1-fwupd.bin"
        ],
        "version": "v2.0.1"
    },
    "jobId": "${jobId}",
    "lastUpdatedAt": "${ts2ISO}",
    "name": "${jobId}",
    "status": "COMPLETED",
    "statusDetail": "All executions in terminal status",
    "target": {
        "deviceIds": [
            "${fingerprint_deviceId}"
        ],
        "tags": []
    }
}
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
  "status": "COMPLETED",
  "statusDetail": "All executions in terminal status",
  "lastUpdatedAt": "${ts2ISO}",
  "version": "v2.0.1"
}
```

## Receive a notification

Soon I should receive a message on the websocket that matches

```json
{
  "@context": "https://github.com/hello-nrfcloud/proto/fota/job-execution",
  "id": "${jobId}",
  "deviceId": "${fingerprint_deviceId}",
  "status": "COMPLETED",
  "statusDetail": "All executions in terminal status",
  "lastUpdatedAt": "${ts2ISO}",
  "version": "v2.0.1"
}
```
