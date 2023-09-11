---
exampleContext:
  fingerprint: secret
  fingerprint_deviceId: 1234
---

# Device Info

> After connecting to the websocket with a device fingerprint, the device info
> is returned

## Background

Given I have the fingerprint for a `PCA20035+solar` device in `fingerprint`

## Connect with a valid fingerprint

When I connect to the websocket using fingerprint `${fingerprint}`

Soon I should receive a message on the websocket that matches

```json
{
  "@context": "https://github.com/hello-nrfcloud/proto/deviceIdentity",
  "id": "${fingerprint_deviceId}",
  "model": "PCA20035+solar"
}
```
