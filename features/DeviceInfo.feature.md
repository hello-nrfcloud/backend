# Device Info

> After connecting to the websocket with a device fingerprint, the device info
> is returned

## Background

Given There is a device as this JSON

```json
{
  "deviceId": "nrf-test-device-id",
  "fingerprint": "2a.c4ff33",
  "model": "PCA20035+solar"
}
```

## Connect with a valid fingerprint

When I connect websocket with fingerprint `2a.c4ff33`

Then the connection response should equal to this JSON

```json
{
  "@context": "https://github.com/bifravst/Muninn-proto/deviceIdentity",
  "id": "nrf-test-device-id",
  "model": "PCA20035+solar"
}
```
