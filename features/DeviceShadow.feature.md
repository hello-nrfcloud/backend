---
exampleContext:
  fingerprint: 92b.y7i24q
  fingerprint_deviceId: 33ec3829-895f-4265-a11f-6c617a2e6b87
---

# Device Shadow

> After connecting to the websocket with a device fingerprint, the device shadow
> is returned

## Background

Given I have the fingerprint for a `PCA20035+solar` device in `fingerprint`

And there is this device shadow data for `${fingerprint_deviceId}` in nRF Cloud

```json
{
  "items": [
    {
      "id": "${fingerprint_deviceId}",
      "tags": ["configuration:solar-shield", "model:PCA20035"],
      "tenantId": "a0673464-e4e1-4b87-bffd-6941a012067b",
      "$meta": {
        "updatedAt": "2023-04-20T07:29:46.467Z",
        "createdAt": "2023-04-19T11:49:07.370Z"
      },
      "name": "${fingerprint_deviceId}",
      "type": "Generic",
      "subType": "PCA10090",
      "firmware": {
        "supports": ["MODEM", "APP"],
        "app": {
          "name": "asset_tracker_v2",
          "version": "1.10.0+thingy91.low-power.solar.memfault.nrfcloud"
        },
        "modem": "mfw_nrf9160_1.3.4"
      },
      "state": {
        "desired": {
          "nrfcloud_mqtt_topic_prefix": "prod/a0673464-e4e1-4b87-bffd-6941a012067b/",
          "pairing": {
            "state": "paired",
            "topics": {
              "d2c": "prod/a0673464-e4e1-4b87-bffd-6941a012067b/m/d/${fingerprint_deviceId}/d2c",
              "c2d": "prod/a0673464-e4e1-4b87-bffd-6941a012067b/m/d/${fingerprint_deviceId}/+/r"
            }
          }
        },
        "reported": {
          "connection": {
            "status": "connected",
            "keepalive": 1200
          },
          "config": {
            "activeMode": false,
            "locationTimeout": 300,
            "activeWaitTime": 120,
            "movementResolution": 120,
            "movementTimeout": 3600,
            "accThreshAct": 4,
            "accThreshInact": 4,
            "accTimeoutInact": 60,
            "nod": []
          },
          "pairing": {
            "state": "paired",
            "topics": {
              "d2c": "prod/a0673464-e4e1-4b87-bffd-6941a012067b/m/d/${fingerprint_deviceId}/d2c",
              "c2d": "prod/a0673464-e4e1-4b87-bffd-6941a012067b/m/d/${fingerprint_deviceId}/+/r"
            }
          },
          "nrfcloud_mqtt_topic_prefix": "prod/a0673464-e4e1-4b87-bffd-6941a012067b/",
          "device": {
            "deviceInfo": {
              "appVersion": "1.10.0+thingy91.low-power.solar.memfault.nrfcloud",
              "modemFirmware": "mfw_nrf9160_1.3.4",
              "imei": "352656108602296",
              "board": "thingy91_nrf9160",
              "sdkVer": "APP_VERSION",
              "appName": "asset_tracker_v2",
              "zephyrVer": "f8f113382356",
              "hwVer": "nRF9160 SICA B1A"
            },
            "simInfo": {
              "uiccMode": 0,
              "iccid": "89457387300008502299",
              "imsi": "234500070442919"
            },
            "serviceInfo": {
              "fota_v2": ["MODEM", "APP"],
              "ui": ["AIR_PRESS", "GNSS", "BUTTON", "TEMP", "HUMID", "RSRP"]
            },
            "networkInfo": {
              "currentBand": 20,
              "networkMode": "LTE-M",
              "rsrp": -97,
              "areaCode": 30401,
              "mccmnc": 24201,
              "cellID": 21679616,
              "ipAddress": "100.74.127.55",
              "eest": 7
            }
          }
        },
        "version": 8835,
        "metadata": {
          "desired": {
            "nrfcloud_mqtt_topic_prefix": {
              "timestamp": 1681904945
            },
            "pairing": {
              "state": {
                "timestamp": 1681904945
              },
              "topics": {
                "d2c": {
                  "timestamp": 1681904945
                },
                "c2d": {
                  "timestamp": 1681904945
                }
              }
            }
          },
          "reported": {
            "connection": {
              "status": {
                "timestamp": 1681975784
              },
              "keepalive": {
                "timestamp": 1681975785
              }
            },
            "config": {
              "activeMode": {
                "timestamp": 1681975785
              },
              "locationTimeout": {
                "timestamp": 1681975785
              },
              "activeWaitTime": {
                "timestamp": 1681975785
              },
              "movementResolution": {
                "timestamp": 1681975785
              },
              "movementTimeout": {
                "timestamp": 1681975785
              },
              "accThreshAct": {
                "timestamp": 1681975785
              },
              "accThreshInact": {
                "timestamp": 1681975785
              },
              "accTimeoutInact": {
                "timestamp": 1681975785
              },
              "nod": []
            },
            "pairing": {
              "state": {
                "timestamp": 1681975785
              },
              "topics": {
                "d2c": {
                  "timestamp": 1681975785
                },
                "c2d": {
                  "timestamp": 1681975785
                }
              }
            },
            "nrfcloud_mqtt_topic_prefix": {
              "timestamp": 1681975785
            },
            "device": {
              "deviceInfo": {
                "appVersion": {
                  "timestamp": 1681975785
                },
                "modemFirmware": {
                  "timestamp": 1681975785
                },
                "imei": {
                  "timestamp": 1681975785
                },
                "board": {
                  "timestamp": 1681975785
                },
                "sdkVer": {
                  "timestamp": 1681975785
                },
                "appName": {
                  "timestamp": 1681975785
                },
                "zephyrVer": {
                  "timestamp": 1681975785
                },
                "hwVer": {
                  "timestamp": 1681975785
                }
              },
              "simInfo": {
                "uiccMode": {
                  "timestamp": 1681975785
                },
                "iccid": {
                  "timestamp": 1681975785
                },
                "imsi": {
                  "timestamp": 1681975785
                }
              },
              "serviceInfo": {
                "fota_v2": [
                  {
                    "timestamp": 1681975785
                  },
                  {
                    "timestamp": 1681975785
                  }
                ],
                "ui": [
                  {
                    "timestamp": 1681975785
                  },
                  {
                    "timestamp": 1681975785
                  },
                  {
                    "timestamp": 1681975785
                  },
                  {
                    "timestamp": 1681975785
                  },
                  {
                    "timestamp": 1681975785
                  },
                  {
                    "timestamp": 1681975785
                  }
                ]
              },
              "networkInfo": {
                "currentBand": {
                  "timestamp": 1682072423
                },
                "networkMode": {
                  "timestamp": 1682072423
                },
                "rsrp": {
                  "timestamp": 1682072423
                },
                "areaCode": {
                  "timestamp": 1682072423
                },
                "mccmnc": {
                  "timestamp": 1682072423
                },
                "cellID": {
                  "timestamp": 1682072423
                },
                "ipAddress": {
                  "timestamp": 1682072423
                },
                "eest": {
                  "timestamp": 1682072423
                }
              }
            }
          }
        }
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
  "@context": "https://github.com/hello-nrfcloud/proto/transformed/PCA20035%2Bsolar/reported",
  "connected": true,
  "version": 8835,
  "config": {
    "activeMode": false,
    "locationTimeout": 300,
    "activeWaitTime": 120,
    "movementResolution": 120,
    "movementTimeout": 3600,
    "accThreshAct": 4,
    "accThreshInact": 4,
    "accTimeoutInact": 60,
    "nod": []
  },
  "device": {
    "deviceInfo": {
      "appVersion": "1.10.0+thingy91.low-power.solar.memfault.nrfcloud",
      "modemFirmware": "mfw_nrf9160_1.3.4",
      "imei": "352656108602296",
      "board": "thingy91_nrf9160",
      "sdkVer": "APP_VERSION",
      "appName": "asset_tracker_v2",
      "zephyrVer": "f8f113382356",
      "hwVer": "nRF9160 SICA B1A"
    },
    "simInfo": {
      "uiccMode": 0,
      "iccid": "89457387300008502299",
      "imsi": "234500070442919"
    },
    "networkInfo": {
      "currentBand": 20,
      "networkMode": "LTE-M",
      "rsrp": -97,
      "areaCode": 30401,
      "mccmnc": 24201,
      "cellID": 21679616,
      "ipAddress": "100.74.127.55",
      "eest": 7
    }
  },
  "ts": 1682072423000
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
  "@context": "https://github.com/hello-nrfcloud/proto/transformed/PCA20035%2Bsolar/reported",
  "connected": true,
  "version": 8835,
  "ts": 1682072423000
}
```
