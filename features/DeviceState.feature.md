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
                "99": 1699197208705
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
                "99": 1699197208705
              }
            }
          },
          "device": {
            "deviceInfo": {
              "modemFirmware": "mfw_nrf91x1_2.0.1",
              "batteryVoltage": 5101,
              "imei": "355025930003908",
              "board": "thingy91x",
              "sdkVer": "v2.6.99-cs1-339-g5cc5862dad1e",
              "appName": "N/A",
              "zephyrVer": "v3.5.99-ncs1-7471-g25fbeabe9004",
              "hwVer": "nRF9151 LACA ADA"
            },
            "networkInfo": {
              "currentBand": 20,
              "supportedBands": "(1,2,3,4,5,8,12,13,18,19,20,25,26,28,66,85)",
              "areaCode": 33131,
              "mccmnc": "24201",
              "ipAddress": "10.108.72.99",
              "ueMode": 2,
              "cellID": 51297540,
              "networkMode": "LTE-M GPS"
            },
            "simInfo": {
              "uiccMode": 0,
              "iccid": "89470060200703359994",
              "imsi": "242016000941158"
            },
            "connectionInfo": { "protocol": "CoAP", "method": "LTE" }
          }
        },
        "metadata": {
          "reported": {
            "device": {
              "deviceInfo": {
                "modemFirmware": { "timestamp": 1716801888 },
                "batteryVoltage": { "timestamp": 1716801888 },
                "imei": { "timestamp": 1716801888 },
                "board": { "timestamp": 1716801888 },
                "sdkVer": { "timestamp": 1716801888 },
                "appName": { "timestamp": 1716801888 },
                "zephyrVer": { "timestamp": 1716801888 },
                "hwVer": { "timestamp": 1716801888 }
              },
              "networkInfo": {
                "currentBand": { "timestamp": 1716801888 },
                "supportedBands": { "timestamp": 1716801888 },
                "areaCode": { "timestamp": 1716801888 },
                "mccmnc": { "timestamp": 1716801888 },
                "ipAddress": { "timestamp": 1716801888 },
                "ueMode": { "timestamp": 1716801888 },
                "cellID": { "timestamp": 1716801888 },
                "networkMode": { "timestamp": 1716801888 }
              },
              "simInfo": {
                "uiccMode": { "timestamp": 1716801888 },
                "iccid": { "timestamp": 1716801888 },
                "imsi": { "timestamp": 1716801888 }
              },
              "connectionInfo": {
                "protocol": { "timestamp": 1716801888 },
                "method": { "timestamp": 1716801888 }
              }
            }
          }
        },
        "version": 8835
      }
    }
  ],
  "total": 1
}
```

## Verify a device sends shadow data to nRF Cloud, then I can receive the message via websocket

Given I connect to the websocket using fingerprint `${fingerprint}`

Soon I should receive a message on the websocket that matches

```json
{
  "@context": "https://github.com/hello-nrfcloud/proto/shadow",
  "desired": [
    {
      "ObjectID": 14240,
      "Resources": {
        "0": 0,
        "1": 162,
        "2": 198,
        "99": 1699197208705
      }
    }
  ],
  "reported": [
    {
      "ObjectID": 14240,
      "Resources": {
        "0": 0,
        "1": 162,
        "2": 198,
        "99": 1699197208705
      }
    },
    {
      "ObjectID": 14204,
      "Resources": {
        "0": "355025930003908",
        "2": "mfw_nrf91x1_2.0.1",
        "3": "N/A",
        "4": "thingy91x",
        "99": "1716801888000",
        "1": "89470060200703359994"
      }
    },
    {
      "ObjectID": 14203,
      "Resources": {
        "99": 1716801888000,
        "0": "LTE-M GPS",
        "1": 20,
        "3": 33131,
        "4": 51297540,
        "5": 24201,
        "6": "10.108.72.99"
      }
    }
  ]
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
  "desired": [
    {
      "ObjectID": 14240,
      "Resources": {
        "0": 0,
        "1": 162,
        "2": 198,
        "99": 1699197208705
      }
    }
  ],
  "reported": [
    {
      "ObjectID": 14240,
      "Resources": {
        "0": 0,
        "1": 162,
        "2": 198,
        "99": 1699197208705
      }
    }
  ]
}
```
