---
needs:
  - Device Info
---

# Device to websocket

> Device messages published on nRF Cloud should be delivered to the websocket
> API

## Background

Given There is a device as this JSON

```json
{
  "deviceId": "nrf-test-device-id",
  "code": "42.d3adbeef",
  "model": "PCA20035+solar"
}
```

## Verify a device sends a message to nRF Cloud, then I can receive the message via website

Given I connect websocket with code `42.d3adbeef`

When a device with id `nrf-test-device-id` publishes to topic
`m/d/nrf-test-device-id/d2c` with a message as this JSON

```json
{
  "appId": "SOLAR",
  "messageType": "DATA",
  "ts": 1681985624779,
  "data": "3.123456"
}
```

Then the response should equal to this JSON

```json
{
  "@context": "https://github.com/bifravst/nRF-Guide-proto/transformed/PCA20035%2Bsolar/gain",
  "ts": 1681985624779,
  "mA": 3.123456
}
```
