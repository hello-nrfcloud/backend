---
exampleContext:
  fingerprint: 92b.y7i24q
  fingerprint_deviceId: 33ec3829-895f-4265-a11f-6c617a2e6b87
  APIURL: https://r8hwx148u8.execute-api.eu-west-1.amazonaws.com/prod
---

# List FOTA bundles

> Power-users can retrieve a list of available bundle IDs for their device so
> they can schedule a FOTA for a different that the suggested one.

## Background

Given I have the fingerprint for a `PCA20065` device in `fingerprint`

And this nRF Cloud API request is queued for a `GET /v1/firmwares` request

```
HTTP/1.1 200 OK
Content-Type: application/json

{
  "items": [
    {
      "bundleId": "APP*0103b0f9*v2.0.0",
      "lastModified": "2023-06-29T14:18:19.000Z",
      "size": 426280,
      "version": "v2.0.0",
      "type": "APP",
      "filenames": ["hello-nrfcloud-thingy91-sol-dbg-v1.1.2-fwupd.bin"],
      "name": "hello.nrfcloud.com v2.0.0",
      "description": "Firmware Update Image BIN file (thingy91, solar, debug)"
    }
  ],
  "total": 1
}
```

## Fetch the list of bundles

When I `GET`
`${APIURL}/device/${fingerprint_deviceId}/fota/bundles?fingerprint=${fingerprint}`

Then the status code of the last response should be `200`

Soon I should receive a `https://github.com/hello-nrfcloud/proto/fota/bundles`
response

And `$.bundles[0]` of the last response should match

```json
{
  "bundleId": "APP*0103b0f9*v2.0.0",
  "version": "v2.0.0",
  "type": "APP"
}
```
