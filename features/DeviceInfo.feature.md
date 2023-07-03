# Device Info

> After connecting to the websocket with a device fingerprint, the device info
> is returned

## Background

Given a `PCA20035+solar` device with the ID `nrf-test-device-id` is registered
with the fingerprint `92b.c4ff33`

## Connect with a valid fingerprint

When I connect to the websocket using fingerprint `92b.c4ff33`

Then I should receive a message on the websocket that matches

```json
{
  "@context": "https://github.com/hello-nrfcloud/proto/deviceIdentity",
  "id": "nrf-test-device-id",
  "model": "PCA20035+solar"
}
```
