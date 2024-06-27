---
exampleContext:
  fingerprint: 92b.y7i24q
  fingerprint_deviceId: oob-352656108602296
  tsISO: 2023-09-12T00:00:00.000Z
  ts: 1694503339523
---

# GNSS

> The firmware publishes GNSS location via the nRF Cloud library, which is
> converted on the message bridge to a MQTT message.

## Background

Given I have the fingerprint for a `PCA20065` device in `fingerprint`

And I connect to the websocket using fingerprint `${fingerprint}`

And I store `$millis()` into `ts`

And I store `$fromMillis(${ts})` into `tsISO`

## Device publishes GNSS location

When the device `${fingerprint_deviceId}` publishes this message to the topic
`m/d/${fingerprint_deviceId}/d2c`

```json
{
  "messageType": "DATA",
  "appId": "GNSS",
  "data": {
    "lat": 61.51222110418335,
    "lng": 6.260091475842378,
    "acc": 18.412057876586914,
    "alt": 311.5220642089844
  },
  "ts": "$number{ts}"
}
```

Soon I should receive a message on the websocket that matches

```json
{
  "@context": "https://github.com/hello-nrfcloud/proto/lwm2m/object/update",
  "ObjectID": 14201,
  "Resources": {
    "0": 61.51222110418335,
    "1": 6.260091475842378,
    "2": 311.5220642089844,
    "3": 18.412057876586914,
    "6": "GNSS",
    "99": "$number{$floor(ts/1000)}"
  }
}
```
