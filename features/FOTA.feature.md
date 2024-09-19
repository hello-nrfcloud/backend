---
exampleContext:
  fingerprint: 92b.y7i24q
  fingerprint_deviceId: oob-352656108602296
  APIURL: https://api.hello.nordicsemi.cloud
  tsJob1CreatedISO: 2023-09-12T00:01:00.000Z
  tsJob2CreatedISO: 2023-09-12T00:02:00.000Z
  tsJob1CompletedISO: 2023-09-12T00:03:00.000Z
  tsJob2CompletedISO: 2023-09-12T00:04:00.000Z
  job1Id: bc631093-7f7c-4c1b-aa63-a68c759bcd5c
  job2Id: 17880ed2-8f56-47c1-ba76-0fda1d4adba9
run: only
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
>
> TODO: multi-path FOTA needs to wait for the device to report the updated
> version before progressing to the next update

## Background

Given I have the fingerprint for a `PCA20065` device in `fingerprint`

And I have a random UUIDv4 in `job1Id`

And I have a random UUIDv4 in `job2Id`

And I store `$fromMillis($millis())` into `tsJob1CreatedISO`

And I store `$fromMillis($millis() + 30 * 1000)` into `tsJob2CreatedISO`

And I store `$fromMillis($millis() + 60 * 1000)` into `tsJob1CompletedISO`

And I store `$fromMillis($millis() + 90 * 1000)` into `tsJob2CompletedISO`

## The device reports that it is eligible for FOTA

<!-- Devices have to report that they support FOTA. -->

Given there is this device shadow data for `${fingerprint_deviceId}` in nRF
Cloud

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
              "appVersion": "2.0.0",
              "modemFirmware": "mfw_nrf91x1_2.0.1",
              "imei": "355025930003908",
              "board": "thingy91x",
              "hwVer": "nRF9151 LACA ADA"
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
                "appVersion": { "timestamp": 1716801888 },
                "modemFirmware": { "timestamp": 1716801888 },
                "imei": { "timestamp": 1716801888 },
                "board": { "timestamp": 1716801888 },
                "hwVer": { "timestamp": 1716801888 }
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

And I connect to the websocket using fingerprint `${fingerprint}`

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

> This example defines an upgrade path from version 2.0.0 to 2.0.2 using two
> delta updates.

<!-- This is the response nRF Cloud returns on the first job creation. -->

Given this nRF Cloud API request is queued for a `POST /v1/fota-jobs` request

```
HTTP/1.1 200 OK
Content-Type: application/json

{"jobId": "${job1Id}"}
```

<!-- Backend fetches details about the first job. -->

And this nRF Cloud API request is queued for a `GET /v1/fota-jobs/${job1Id}`
request

```
HTTP/1.1 200 OK
Content-Type: application/json

{
    "createdAt": "${tsJob1CreatedISO}",
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
    "jobId": "${job1Id}",
    "lastUpdatedAt": "${tsJob1CreatedISO}",
    "name": "${job1Id}",
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

When I `POST`
`${APIURL}/device/${fingerprint_deviceId}/fota/app?fingerprint=${fingerprint}`
with

```json
{
  "upgradePath": {
    "2.0.0": "APP*1e29dfa3*v2.0.1",
    "2.0.1": "APP*cd5412d9*v2.0.2"
  }
}
```

Then the status code of the last response should be `201`

And I should receive a `https://github.com/hello-nrfcloud/proto/fota/job`
response

Soon the nRF Cloud API should have been called with

```
POST /v1/fota-jobs HTTP/1.1
Content-Type: application/json

{"bundleId":"APP*1e29dfa3*v2.0.1","autoApply":true,"deviceIdentifiers":["${fingerprint_deviceId}"]}
```

## Check the status for the upgrade to 2.0.1

When I `GET`
`${APIURL}/device/${fingerprint_deviceId}/fota/jobs?fingerprint=${fingerprint}`
retrying 10 times

Soon I should receive a `https://github.com/hello-nrfcloud/proto/fota/jobs`
response

And `$.jobs[0]` of the last response should match

```json
{
  "deviceId": "${fingerprint_deviceId}",
  "status": "IN_PROGRESS",
  "statusDetail": "Started job for version 2.0.0 with bundle APP*1e29dfa3*v2.0.1.",
  "reportedVersion": "2.0.0"
}
```

## Job for 2.0.1 completes

> The job is marked as completed by nRF Cloud

Given this nRF Cloud API request is queued for a `GET /v1/fota-jobs/${job1Id}`
request

```
HTTP/1.1 200 OK
Content-Type: application/json

{
    "createdAt": "${tsJob1CompletedISO}",
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
    "jobId": "${job1Id}",
    "lastUpdatedAt": "${tsJob1CompletedISO}",
    "name": "${job1Id}",
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

<!-- Devices reports updated version to v2.0.1 -->

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
              "appVersion": "2.0.1",
              "modemFirmware": "mfw_nrf91x1_2.0.1",
              "imei": "355025930003908",
              "board": "thingy91x",
              "hwVer": "nRF9151 LACA ADA"
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
                "appVersion": {
                  "timestamp": "$number{$floor($millis()/1000)}"
                },
                "modemFirmware": {
                  "timestamp": "$number{$floor($millis()/1000)}"
                },
                "imei": { "timestamp": "$number{$floor($millis()/1000)}" },
                "board": { "timestamp": "$number{$floor($millis()/1000)}" },
                "hwVer": { "timestamp": "$number{$floor($millis()/1000)}" }
              },
              "serviceInfo": {
                "fota_v2": [
                  {
                    "timestamp": "$number{$floor($millis()/1000)}"
                  },
                  {
                    "timestamp": "$number{$floor($millis()/1000)}"
                  },
                  {
                    "timestamp": "$number{$floor($millis()/1000)}"
                  }
                ]
              }
            }
          }
        },
        "version": 8836
      }
    }
  ],
  "total": 1
}
```

<!-- This is the response nRF Cloud returns on the second job creation. -->

And this nRF Cloud API request is queued for a `POST /v1/fota-jobs` request

```
HTTP/1.1 200 OK
Content-Type: application/json

{"jobId": "${job2Id}"}
```

<!-- Backend fetches details about the second job. -->

And this nRF Cloud API request is queued for a `GET /v1/fota-jobs/${job2Id}`
request

```
HTTP/1.1 200 OK
Content-Type: application/json

{
    "createdAt": "${tsJob2CreatedISO}",
    "firmware": {
        "bundleId": "APP*cd5412d9*v2.0.2",
        "fileSize": 425860,
        "firmwareType": "APP",
        "host": "firmware.nrfcloud.com",
        "uris": [
            "bbfe6b73-a46a-43ad-94bd-8e4b4a7847ce/APP*cd5412d9*v2.0.2/hello-nrfcloud-thingy91x-v2.0.2-fwupd.bin"
        ],
        "version": "v2.0.2"
    },
    "jobId": "${job2Id}",
    "lastUpdatedAt": "${tsJob2CreatedISO}",
    "name": "${job2Id}",
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

## The FOTA job for the next bundle should be created automatically.

<!-- Check the status for the upgrade to 2.0.2 -->

When I `GET`
`${APIURL}/device/${fingerprint_deviceId}/fota/jobs?fingerprint=${fingerprint}`
retrying 10 times

Soon I should receive a `https://github.com/hello-nrfcloud/proto/fota/jobs`
response

And `$.jobs[0]` of the last response should match

```json
{
  "deviceId": "${fingerprint_deviceId}",
  "status": "IN_PROGRESS",
  "statusDetail": "Started job for version 2.0.1 with bundle APP*cd5412d9*v2.0.2.",
  "reportedVersion": "2.0.1"
}
```

## Job for 2.0.2 completes

> The job is marked as completed by nRF Cloud

Given this nRF Cloud API request is queued for a `GET /v1/fota-jobs/${job2Id}`
request

```
HTTP/1.1 200 OK
Content-Type: application/json

{
    "createdAt": "${tsJob2CompletedISO}",
    "firmware": {
        "bundleId": "APP*cd5412d9*v2.0.2",
        "fileSize": 425860,
        "firmwareType": "APP",
        "host": "firmware.nrfcloud.com",
        "uris": [
            "bbfe6b73-a46a-43ad-94bd-8e4b4a7847ce/APP*cd5412d9*v2.0.2/hello-nrfcloud-thingy91x-v2.0.2-fwupd.bin"
        ],
        "version": "v2.0.2"
    },
    "jobId": "${job2Id}",
    "lastUpdatedAt": "${tsJob2CompletedISO}",
    "name": "${job2Id}",
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

<!-- Devices reports updated version. -->

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
              "appVersion": "2.0.2",
              "modemFirmware": "mfw_nrf91x1_2.0.1",
              "imei": "355025930003908",
              "board": "thingy91x",
              "hwVer": "nRF9151 LACA ADA"
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
                "appVersion": {
                  "timestamp": "$number{$floor($millis()/1000)}"
                },
                "modemFirmware": {
                  "timestamp": "$number{$floor($millis()/1000)}"
                },
                "imei": { "timestamp": "$number{$floor($millis()/1000)}" },
                "board": { "timestamp": "$number{$floor($millis()/1000)}" },
                "hwVer": { "timestamp": "$number{$floor($millis()/1000)}" }
              },
              "serviceInfo": {
                "fota_v2": [
                  {
                    "timestamp": "$number{$floor($millis()/1000)}"
                  },
                  {
                    "timestamp": "$number{$floor($millis()/1000)}"
                  },
                  {
                    "timestamp": "$number{$floor($millis()/1000)}"
                  }
                ]
              }
            }
          }
        },
        "version": 8837
      }
    }
  ],
  "total": 1
}
```

## Check the status

When I `GET`
`${APIURL}/device/${fingerprint_deviceId}/fota/jobs?fingerprint=${fingerprint}`
retrying 10 times

Soon I should receive a `https://github.com/hello-nrfcloud/proto/fota/jobs`
response

And `$.jobs[0]` of the last response should match

```json
{
  "deviceId": "${fingerprint_deviceId}",
  "status": "SUCCEEDED",
  "statusDetail": "No more bundles to apply for 2.0.2. Job completed.",
  "reportedVersion": "2.0.2"
}
```

## Receive a notification

Soon I should receive a message on the websocket that matches

```json
{
  "@context": "https://github.com/hello-nrfcloud/proto/fota/job",
  "deviceId": "${fingerprint_deviceId}",
  "status": "SUCCEEDED",
  "statusDetail": "No more bundles to apply for 2.0.2. Job completed.",
  "reportedVersion": "2.0.2"
}
```
