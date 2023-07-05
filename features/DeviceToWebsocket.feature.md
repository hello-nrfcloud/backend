---
needs:
  - Device Info
---

# Device to websocket

> Device messages published on nRF Cloud should be delivered to the websocket
> API

## Verify a device sends a message to nRF Cloud, then I can receive the message via website

Given I store `$millis()` into `ts`

When the device `${fingerprint:deviceId}` publishes this message to the topic
`m/d/${fingerprint:deviceId}/d2c`

```json
{
  "appId": "SOLAR",
  "messageType": "DATA",
  "ts": ${ts},
  "data": "3.123456"
}
```

<!-- @retry:tries=5,initialDelay=5000,delayFactor=1 -->

Soon I should receive a message on the websocket that matches

```json
{
  "@context": "https://github.com/hello-nrfcloud/proto/transformed/PCA20035%2Bsolar/gain",
  "ts": ${ts},
  "mA": 3.123456
}
```
