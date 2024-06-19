---
exampleContext:
  fingerprint: 92b.y7i24q
  fingerprint_deviceId: oob-352656108602296
  APIURL: https://api.hello.nordicsemi.cloud
---

# Device Info

> The device information can also be access using the REST API.
>
> This is needed by `hello.nrfcloud.com/map`.

## Background

Given I have the fingerprint for a `PCA20065` device in `fingerprint`

## Connect with a valid fingerprint

When I `GET` `${APIURL}/device?fingerprint=${fingerprint}`

Then the last response should match

```json
{
  "@context": "https://github.com/hello-nrfcloud/proto/deviceIdentity",
  "id": "${fingerprint_deviceId}",
  "model": "PCA20065"
}
```
