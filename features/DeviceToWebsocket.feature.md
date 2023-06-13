---
needs:
  - Device Info
---

# Device to websocket

> Device messages published on nRF Cloud should be delivered to the websocket
> API

## Background

Given a `PCA20035+solar` device with the ID `nrf-test-device-id` is registered
with the fingerprint `2a.c4ff33`

## Verify a device sends a message to nRF Cloud, then I can receive the message via website

Given I connect websocket with fingerprint `2a.c4ff33`

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
  "@context": "https://github.com/bifravst/Muninn-proto/transformed/PCA20035%2Bsolar/gain",
  "ts": 1681985624779,
  "mA": 3.123456
}
```
