---
exampleContext:
  fingerprint: 92b.y7i24q
  fingerprint_deviceId: oob-352656108602296
variants:
  - account: nordic
  - account: elite
---

# Multiple nRF Cloud accounts

> After connecting to the websocket with a device fingerprint under specific
> account, the device shadow is returned

## Verify the account device sends shadow data to nRF Cloud and there is a shadow request with the associated API key

Given I have the fingerprint for a `PCA20065` device in the `${variant.account}`
account in `fingerprint`

And there is this device shadow data for `${fingerprint_deviceId}` in nRF Cloud

```json
{
  "items": [
    {
      "id": "${fingerprint_deviceId}",
      "$meta": {
        "createdAt": "${$fromMillis($millis())}",
        "updatedAt": "${$fromMillis($millis())}"
      },
      "state": {
        "desired": {
          "lwm2m": {
            "14240:1.0": {
              "0": {
                "0": 0,
                "1": 162,
                "2": 198,
                "99": 1699197208
              }
            }
          }
        },
        "reported": {
          "lwm2m": {
            "14240:1.0": {
              "0": {
                "0": 0,
                "1": 162,
                "2": 198,
                "99": 1699197208
              }
            }
          }
        },
        "metadata": {
          "desired": {
            "lwm2m": {
              "14240:1.0": {
                "0": {
                  "0": { "timestamp": 1699197208 },
                  "1": { "timestamp": 1699197208 },
                  "2": { "timestamp": 1699197208 },
                  "99": { "timestamp": 1699197208 }
                }
              }
            }
          },
          "reported": {
            "lwm2m": {
              "14240:1.0": {
                "0": {
                  "0": { "timestamp": 1699197208 },
                  "1": { "timestamp": 1699197208 },
                  "2": { "timestamp": 1699197208 },
                  "99": { "timestamp": 1699197208 }
                }
              }
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

When I connect to the websocket using fingerprint `${fingerprint}`

Soon the shadow for `${fingerprint_deviceId}` in the `${variant.account}`
account has been requested
