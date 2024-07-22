---
exampleContext:
  fingerprintMQTT: 92b.y7i24q
  fingerprintMQTT_deviceId: oob-352656108602296
  tsMQTT: 1694503339523
  tsISO: 2023-09-12T00:00:00.000Z
needs:
  - Device to websocket (MQTT)
---

# Last seen

> I should receive a timestamp when the device last sent in data to the cloud
> using MQTT so I can determine if the device is active.

## Retrieve last seen timestamp on connect

Given I store `$fromMillis($floor(tsMQTT/1000)*1000)` into `tsISO`

When I reconnect to the websocket using fingerprint `${fingerprintMQTT}`

Soon I should receive a message on the websocket that matches

```json
{
  "@context": "https://github.com/hello-nrfcloud/proto/deviceIdentity",
  "id": "${fingerprintMQTT_deviceId}",
  "model": "PCA20065"
}
```

And `lastSeen >= "${tsISO}"` of the last matched websocket message equals

```json
true
```
