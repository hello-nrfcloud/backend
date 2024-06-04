---
exampleContext:
  fingerprint: 92b.y7i24q
  fingerprint_deviceId: 33ec3829-895f-4265-a11f-6c617a2e6b87
  ts: 1694503339523
  tsISO: 2023-09-12T00:00:00.000Z
---

# Last seen

> I should receive a timestamp when the device last sent in data to the cloud so
> I can determine if the device is active.

## Background

Given I have the fingerprint for a `PCA20065` device in `fingerprint`

<!-- The device sends in data to the cloud -->

And I store `$floor($millis()/1000)*1000` into `ts`

When the device `${fingerprint_deviceId}` does a `POST` to this CoAP resource
`/msg/d2c/raw` with this SenML payload

```json
[
  {
    "bn": "14202/0/",
    "n": "1",
    "v": 4.398,
    "bt": "$number{ts}"
  }
]
```

## Retrieve last seen timestamp on connect

Given I store `$fromMillis(${ts})` into `tsISO`

When I connect to the websocket using fingerprint `${fingerprint}`

Soon I should receive a message on the websocket that matches

```json
{
  "@context": "https://github.com/hello-nrfcloud/proto/deviceIdentity",
  "id": "${fingerprint_deviceId}",
  "model": "PCA20065"
}
```

And `lastSeen >= "${tsISO}"` of the last matched websocket message equals

```json
true
```
