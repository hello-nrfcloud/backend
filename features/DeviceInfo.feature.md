# Device Info

> After connecting to the websocket with a device code, the device info is
> returned

## Background

Given There is a device as this JSON

```json
{
  "deviceId": "nrf-test-device-id",
  "code": "42.d3adbeef",
  "model": "PCA20035+solar"
}
```

## Connect with a valid code

When I connect websocket with code `42.d3adbeef`

Then the connection response should equal to this JSON

```json
{
  "@context": "https://github.com/bifravst/nRF-Guide-proto/deviceIdentity",
  "id": "nrf-test-device-id",
  "model": "PCA20035+solar"
}
```
