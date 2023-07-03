---
needs:
  - Device Info
---

# Device to websocket

> Device messages published on nRF Cloud should be delivered to the websocket
> API

## Background

Given a `PCA20035+solar` device with the ID `nrf-test-device-id` is registered
with the fingerprint `92b.c4ff33`

## Verify a device sends a message to nRF Cloud, then I can receive the message via website

Given I connect to the websocket using fingerprint `92b.c4ff33`

And I store `$millis()` into `ts`

When a device with id `nrf-test-device-id` publishes to topic
`m/d/nrf-test-device-id/d2c`

```json
{
  "appId": "SOLAR",
  "messageType": "DATA",
  "ts": ${ts},
  "data": "3.123456"
}
```

Then I should receive a message on the websocket that matches

```json
{
  "@context": "https://github.com/hello-nrfcloud/proto/transformed/PCA20035%2Bsolar/gain",
  "ts": ${ts},
  "mA": 3.123456
}
```
