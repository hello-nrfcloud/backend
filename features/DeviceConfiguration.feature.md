---
exampleContext:
  fingerprint: 92b.y7i24q
  fingerprint_deviceId: 33ec3829-895f-4265-a11f-6c617a2e6b87
---

# Device configuration

> A user can configure a device
>
> This will result in the nRF Cloud API for the device being called to configure
> the device state.

## Background

Given I have the fingerprint for a `PCA20065` device in `fingerprint`

And I connect to the websocket using fingerprint `${fingerprint}`

## Enable GNSS

> GNSS location is disabled by default to allow other data to be acquired faster
> on the device (because waiting for GNSS) takes quite a long time. Users are
> allowed to enable it.

Given this nRF Cloud API is queued for a
`PATCH /v1/devices/${fingerprint_deviceId}/state` request

```
HTTP/1.1 202 Accepted
```

When I send this message via the websocket

```json
{
  "message": "message",
  "payload": {
    "@context": "https://github.com/hello-nrfcloud/proto/configure-device",
    "id": "${fingerprint_deviceId}",
    "configuration": {
      "gnss": true
    }
  }
}
```

Soon I should receive a message on the websocket that matches

```json
{
  "@context": "https://github.com/hello-nrfcloud/proto/device-configured",
  "id": "${fingerprint_deviceId}",
  "configuration": { "gnss": true }
}
```

Soon the nRF Cloud API should have been called with

```
PATCH /v1/devices/${fingerprint_deviceId}/state HTTP/1.1
Content-Type: application/json

{"desired":{"config":{"nod":[]}}}
```

## Configure update interval

> The default updated interval is optimized for interactivity. Users can change
> that interval to something that suits their needs in order to extend battery
> life and reduce data consumption.

Given this nRF Cloud API is queued for a
`PATCH /v1/devices/${fingerprint_deviceId}/state` request

```
HTTP/1.1 202 Accepted
```

When I send this message via the websocket

```json
{
  "message": "message",
  "payload": {
    "@context": "https://github.com/hello-nrfcloud/proto/configure-device",
    "id": "${fingerprint_deviceId}",
    "configuration": {
      "updateIntervalSeconds": 600
    }
  }
}
```

Soon I should receive a message on the websocket that matches

```json
{
  "@context": "https://github.com/hello-nrfcloud/proto/device-configured",
  "id": "${fingerprint_deviceId}",
  "configuration": { "updateIntervalSeconds": 600 }
}
```

Soon the nRF Cloud API should have been called with

```
PATCH /v1/devices/${fingerprint_deviceId}/state HTTP/1.1
Content-Type: application/json

{"desired":{"config":{"activeWaitTime":600}}}
```
