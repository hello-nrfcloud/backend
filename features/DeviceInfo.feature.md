# Device Info

> After connecting to the websocket with a device fingerprint, the device info
> is returned

## Background

Given a `PCA20035+solar` device with the ID `nrf-test-device-id` is registered
with the fingerprint `2a.c4ff33`

## Connect with a valid fingerprint

When I connect websocket with fingerprint `2a.c4ff33`

Then the connection response should equal to this JSON

```json
{
  "@context": "https://github.com/hello-nrfcloud/proto/deviceIdentity",
  "id": "nrf-test-device-id",
  "model": "PCA20035+solar"
}
```
