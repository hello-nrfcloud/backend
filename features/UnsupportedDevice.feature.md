---
exampleContext:
  fingerprintUnsupported: 922.s5ahm3
  fingerprintUnsupported_deviceId: b137abdd-618b-4ab3-a2f1-14b66bc96738
---

# Unsupported Device

> Some devices are shipped with a QR code on the device but are not intended to
> be used on hello.nrfcloud.com. In case a user scans such a QR code, they
> should receive a useful error message.

## Background

Given I have the fingerprint for an unsupported device in
`fingerprintUnsupported`

## Connect with the fingerprint of an unsupported device

When I connect to the websocket using fingerprint `${fingerprintUnsupported}`

Soon I should receive a message on the websocket that matches

```json
{
  "@context": "https://github.com/hello-nrfcloud/proto/deviceIdentity",
  "id": "${fingerprintUnsupported_deviceId}",
  "model": "unsupported"
}
```
