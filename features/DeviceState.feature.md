---
exampleContext:
  fingerprint: 92b.y7i24q
  fingerprint_deviceId: 33ec3829-895f-4265-a11f-6c617a2e6b87
---

# Device State

> After connecting to the websocket with a device fingerprint, the device state
> is returned

## Background

Given I have the fingerprint for a `PCA20065` device in `fingerprint`

And there is this device shadow data for `${fingerprint_deviceId}` in nRF Cloud

```json
{
  "items": [
    {
      "id": "${fingerprint_deviceId}",
      "state": {
        "desired": {
          "14240:1.0": {
            "0": {
              "0": 0,
              "1": 162,
              "2": 198,
              "99": 1699197208705
            }
          }
        },
        "reported": {
          "connection": {
            "status": "connected",
            "keepalive": 1200
          },
          "14240:1.0": {
            "0": {
              "0": 0,
              "1": 162,
              "2": 198,
              "99": 1699197208705
            }
          }
        },
        "version": 8835
      }
    }
  ],
  "total": 1,
  "pageNextToken": "4bb1f9ab35bd"
}
```

## Verify a device sends shadow data to nRF Cloud, then I can receive the message via websocket

Given I connect to the websocket using fingerprint `${fingerprint}`

Soon I should receive a message on the websocket that matches

```json
{
  "@context": "https://github.com/hello-nrfcloud/proto/shadow",
  "connected": true,
  "version": 8835,
  "desired": {
    "14240:1.0": {
      "0": {
        "0": 0,
        "1": 162,
        "2": 198,
        "99": 1699197208705
      }
    }
  },
  "reported": {
    "14240:1.0": {
      "0": {
        "0": 0,
        "1": 162,
        "2": 198,
        "99": 1699197208705
      }
    }
  }
}
```

## Sent last known shadow

> On connect, send the last known shadow of a device. This is needed for devices
> which are in low-power mode and may not send data for another hour. Without
> the shadow the UI does not know what the real device configuration is and
> cannot accurately predict when the device will send in data next.

Given I reconnect to the websocket using fingerprint `${fingerprint}`

Soon I should receive a message on the websocket that matches

```json
{
  "@context": "https://github.com/hello-nrfcloud/proto/shadow",
  "connected": true,
  "version": 8835,
  "desired": {
    "14240:1.0": {
      "0": {
        "0": 0,
        "1": 162,
        "2": 198,
        "99": 1699197208705
      }
    }
  },
  "reported": {
    "14240:1.0": {
      "0": {
        "0": 0,
        "1": 162,
        "2": 198,
        "99": 1699197208705
      }
    }
  }
}
```
