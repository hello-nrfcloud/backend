---
exampleContext:
  fingerprint: 92b.y7i24q
  fingerprint_deviceId: oob-352656108602296
  APIURL: https://api.hello.nordicsemi.cloud
  tsJob1CreatedISO: 2023-09-12T00:01:00.000Z
  tsJob1CancelledISO: 2023-09-12T00:03:00.000Z
  nrfCloudJobId: bc631093-7f7c-4c1b-aa63-a68c759bcd5c
  jobId: 01J861VKYH5QVD6QQ5YXXF20EF
needs:
  - Device FOTA
run: only
---

# Abort Device FOTA jobs

> A user abort a running firmware update job for a device.

## Background

Given I have the fingerprint for a `PCA20065` device in `fingerprint`

And I have a random UUIDv4 in `nrfCloudJobId`

And I store `$fromMillis($millis())` into `tsJob1CreatedISO`

And I store `$fromMillis($millis() + 60 * 1000)` into `tsJob1CancelledISO`

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

Given this nRF Cloud API request is queued for a `POST /v1/fota-jobs` request

```
HTTP/1.1 200 OK
Content-Type: application/json

{"jobId": "${nrfCloudJobId}"}
```

And this nRF Cloud API request is queued for a
`GET /v1/fota-jobs/${nrfCloudJobId}` request

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
    "jobId": "${nrfCloudJobId}",
    "lastUpdatedAt": "${tsJob1CreatedISO}",
    "name": "${nrfCloudJobId}",
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
    ">=0.0.0": "APP*1e29dfa3*v2.0.1"
  }
}
```

Then the status code of the last response should be `201`

And I should receive a `https://github.com/hello-nrfcloud/proto/fota/job`
response

And I store `id` of the last response into `jobId`

## Cancel the job

When I `DELETE`
`${APIURL}/device/${fingerprint_deviceId}/fota/job/${jobId}?fingerprint=${fingerprint}`

Then the status code of the last response should be `202`

## Job is cancelled

When I `GET`
`${APIURL}/device/${fingerprint_deviceId}/fota/jobs?fingerprint=${fingerprint}`
retrying 10 times

Soon I should receive a `https://github.com/hello-nrfcloud/proto/fota/jobs`
response

And `$.jobs[0]` of the last response should match

```json
{
  "deviceId": "${fingerprint_deviceId}",
  "status": "FAILED",
  "statusDetail": "The job was cancelled."
}
```

## Receive a notification

Soon I should receive a message on the websocket that matches

```json
{
  "@context": "https://github.com/hello-nrfcloud/proto/fota/job",
  "deviceId": "${fingerprint_deviceId}",
  "status": "FAILED",
  "statusDetail": "The job was cancelled."
}
```
