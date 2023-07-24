# Device configuration

> A user can configure a device
>
> This will result in the nRF Cloud API for the device being called to configure
> the device state.

## Background

Given I have the fingerprint for a `PCA20035+solar` device in `fingerprint`

And the device `${fingerprint_deviceId}` has this state

```json
{
  "desired": {
    "config": {
      "nod": ["gnss"]
    }
  },
  "version": 8835
}
```

And I connect to the websocket using fingerprint `${fingerprint}`

## Enable GNSS

> GNSS location is disabled by default to allow other data to be acquired faster
> on the device (because waiting for GNSS) takes quite a long time. Users are
> allowed to enable it.

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

Soon the nRF Cloud API should have been called with

```
PATCH /v1/devices/${fingerprint_deviceId}/state HTTP/1.1
Content-Length: 36
Content-Type: application/json
If-Match: 8835

{"desired":{"config":{"nod":null}}}
```
