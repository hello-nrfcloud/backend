---
exampleContext:
  fingerprint: 92b.y7i24q
  fingerprint_deviceId: oob-352656108602296
  APIURL: https://r8hwx148u8.execute-api.eu-west-1.amazonaws.com/prod
---

# Device Info

> The device information can also be access using the REST API.
>
> This is needed by `hello.nrfcloud.com/map`.

## Background

Given I have the fingerprint for a `PCA20035+solar` device in `fingerprint`

## Connect with a valid fingerprint

When I `GET` `${APIURL}/device?fingerprint=${fingerprint}`

Then the last response should match

```json
{
  "@context": "https://github.com/hello-nrfcloud/proto/deviceIdentity",
  "id": "${fingerprint_deviceId}",
  "model": "PCA20035+solar"
}
```
