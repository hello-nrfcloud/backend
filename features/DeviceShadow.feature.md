# Device Shadow

> After connecting to the websocket with a device code, the device shadow is
> returned

## Background

Given There is a device as this JSON

```json
{
  "id": "nrf-test-shadow-device-id",
  "deviceId": "nrf-test-shadow-device-id",
  "code": "42.d3c4fb4d",
  "name": "nrf-test-shadow-device-id",
  "subType": "jitp-nordic-hardware",
  "tags": ["temperature", "warehouse-east"],
  "firmware": {
    "supports": ["APP", "MODEM"],
    "app": {
      "version": "0.0.0-development"
    },
    "modem": "mfw_nrf9160_1.3.3"
  },
  "type": "Generic"
}
```

And there is a shadow data of device id `nrf-test-shadow-device-id` in nRF Cloud
as this JSON

```json
{
  "items": [
    {
      "id": "nrf-test-shadow-device-id",
      "tags": [],
      "tenantId": "543c2184-c7fe-4ca6-a2a0-c06db425fbbf",
      "$meta": {
        "updatedAt": "2023-02-14T09:19:52.092Z",
        "createdAt": "2023-01-10T13:22:44.582Z"
      },
      "name": "nrf-test-shadow-device-id",
      "image": "https://device-images.nrfcloud.com/543c2184-c7fe-4ca6-a2a0-c06db425fbbf_nrf-test-shadow-device-id_4b3f40d61e.png",
      "type": "Generic",
      "subType": "jitp-nordic-hardware",
      "firmware": {
        "supports": ["MODEM", "APP"],
        "app": {
          "version": "0.0.0-development"
        },
        "modem": "mfw_nrf9160_1.3.3"
      },
      "state": {
        "desired": {
          "pairing": {
            "state": "paired",
            "topics": {
              "d2c": "prod/543c2184-c7fe-4ca6-a2a0-c06db425fbbf/m/d/nrf-test-shadow-device-id/d2c",
              "c2d": "prod/543c2184-c7fe-4ca6-a2a0-c06db425fbbf/m/d/nrf-test-shadow-device-id/+/r"
            }
          },
          "nrfcloud_mqtt_topic_prefix": "prod/543c2184-c7fe-4ca6-a2a0-c06db425fbbf/"
        },
        "reported": {
          "connection": {
            "status": "disconnected",
            "keepalive": 1200,
            "disconnectReason": "MQTT_KEEP_ALIVE_TIMEOUT",
            "clientInitiatedDisconnect": false
          },
          "pairing": {
            "state": "paired",
            "topics": {
              "d2c": "prod/543c2184-c7fe-4ca6-a2a0-c06db425fbbf/m/d/nrf-test-shadow-device-id/d2c",
              "c2d": "prod/543c2184-c7fe-4ca6-a2a0-c06db425fbbf/m/d/nrf-test-shadow-device-id/+/r"
            }
          },
          "nrfcloud_mqtt_topic_prefix": "prod/543c2184-c7fe-4ca6-a2a0-c06db425fbbf/",
          "config": {
            "activeMode": true,
            "gnssTimeout": 30,
            "activeWaitTime": 120,
            "movementResolution": 120,
            "movementTimeout": 3600,
            "accThreshAct": 10,
            "accThreshInact": 5,
            "accTimeoutInact": 60,
            "nod": [],
            "locationTimeout": 300
          },
          "device": {
            "serviceInfo": {
              "fota_v2": ["MODEM", "APP"],
              "ui": ["AIR_PRESS", "GNSS", "BUTTON", "TEMP", "HUMID", "RSRP"]
            },
            "deviceInfo": {
              "imei": "350457794611739",
              "iccid": "8931080620054223678",
              "modemFirmware": "mfw_nrf9160_1.3.3",
              "board": "thingy91_nrf9160",
              "appVersion": "0.0.0-development"
            },
            "networkInfo": {
              "currentBand": 3,
              "networkMode": "LTE-M",
              "rsrp": -89,
              "areaCode": 6,
              "mccmnc": 24001,
              "cellID": 25616139,
              "ipAddress": "10.160.243.113"
            }
          }
        },
        "version": 89,
        "metadata": {
          "desired": {
            "pairing": {
              "state": {
                "timestamp": 1673356964
              },
              "topics": {
                "d2c": {
                  "timestamp": 1673356964
                },
                "c2d": {
                  "timestamp": 1673356964
                }
              }
            },
            "nrfcloud_mqtt_topic_prefix": {
              "timestamp": 1673356964
            }
          },
          "reported": {
            "connection": {
              "status": {
                "timestamp": 1676372384
              },
              "keepalive": {
                "timestamp": 1676369307
              },
              "disconnectReason": {
                "timestamp": 1676372384
              },
              "clientInitiatedDisconnect": {
                "timestamp": 1676372384
              }
            },
            "pairing": {
              "state": {
                "timestamp": 1676369307
              },
              "topics": {
                "d2c": {
                  "timestamp": 1676369307
                },
                "c2d": {
                  "timestamp": 1676369307
                }
              }
            },
            "nrfcloud_mqtt_topic_prefix": {
              "timestamp": 1676369307
            },
            "config": {
              "activeMode": {
                "timestamp": 1676369307
              },
              "gnssTimeout": {
                "timestamp": 1673356981
              },
              "activeWaitTime": {
                "timestamp": 1676369307
              },
              "movementResolution": {
                "timestamp": 1676369307
              },
              "movementTimeout": {
                "timestamp": 1676369307
              },
              "accThreshAct": {
                "timestamp": 1676369307
              },
              "accThreshInact": {
                "timestamp": 1676369307
              },
              "accTimeoutInact": {
                "timestamp": 1676369307
              },
              "nod": [],
              "locationTimeout": {
                "timestamp": 1676369307
              }
            },
            "device": {
              "serviceInfo": {
                "fota_v2": [
                  {
                    "timestamp": 1676369308
                  },
                  {
                    "timestamp": 1676369308
                  }
                ],
                "ui": [
                  {
                    "timestamp": 1676369308
                  },
                  {
                    "timestamp": 1676369308
                  },
                  {
                    "timestamp": 1676369308
                  },
                  {
                    "timestamp": 1676369308
                  },
                  {
                    "timestamp": 1676369308
                  },
                  {
                    "timestamp": 1676369308
                  }
                ]
              },
              "deviceInfo": {
                "imei": {
                  "timestamp": 1676369403
                },
                "iccid": {
                  "timestamp": 1676369403
                },
                "modemFirmware": {
                  "timestamp": 1676369403
                },
                "board": {
                  "timestamp": 1676369403
                },
                "appVersion": {
                  "timestamp": 1676369403
                }
              },
              "networkInfo": {
                "currentBand": {
                  "timestamp": 1676369504
                },
                "networkMode": {
                  "timestamp": 1676369403
                },
                "rsrp": {
                  "timestamp": 1676370584
                },
                "areaCode": {
                  "timestamp": 1676369403
                },
                "mccmnc": {
                  "timestamp": 1676369403
                },
                "cellID": {
                  "timestamp": 1676369504
                },
                "ipAddress": {
                  "timestamp": 1676369403
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

## Verify a device sends shadow data to nRF Cloud, then I can receive the message via website

Given I connect websocket with code `42.d3c4fb4d`

Then wait for `1` minute(s)

Then the response should equal to this JSON

```json
{
  "@context": "https://github.com/bifravst/nrf.guide-backend/device-shadow",
  "deviceId": "nrf-test-shadow-device-id",
  "payload": {
    "state": {
      "reported": {
        "connection": {
          "status": "disconnected",
          "keepalive": 1200,
          "disconnectReason": "MQTT_KEEP_ALIVE_TIMEOUT",
          "clientInitiatedDisconnect": false
        },
        "pairing": {
          "state": "paired",
          "topics": {
            "d2c": "prod/543c2184-c7fe-4ca6-a2a0-c06db425fbbf/m/d/nrf-test-shadow-device-id/d2c",
            "c2d": "prod/543c2184-c7fe-4ca6-a2a0-c06db425fbbf/m/d/nrf-test-shadow-device-id/+/r"
          }
        },
        "nrfcloud_mqtt_topic_prefix": "prod/543c2184-c7fe-4ca6-a2a0-c06db425fbbf/",
        "config": {
          "activeMode": true,
          "gnssTimeout": 30,
          "activeWaitTime": 120,
          "movementResolution": 120,
          "movementTimeout": 3600,
          "accThreshAct": 10,
          "accThreshInact": 5,
          "accTimeoutInact": 60,
          "nod": [],
          "locationTimeout": 300
        },
        "device": {
          "serviceInfo": {
            "fota_v2": ["MODEM", "APP"],
            "ui": ["AIR_PRESS", "GNSS", "BUTTON", "TEMP", "HUMID", "RSRP"]
          },
          "deviceInfo": {
            "imei": "350457794611739",
            "iccid": "8931080620054223678",
            "modemFirmware": "mfw_nrf9160_1.3.3",
            "board": "thingy91_nrf9160",
            "appVersion": "0.0.0-development"
          },
          "networkInfo": {
            "currentBand": 3,
            "networkMode": "LTE-M",
            "rsrp": -89,
            "areaCode": 6,
            "mccmnc": 24001,
            "cellID": 25616139,
            "ipAddress": "10.160.243.113"
          }
        }
      }
    }
  }
}
```

## Verify I will not receive the device shadow if the version is not updated

Given I connect websocket with code `42.d3c4fb4d`

And wait for `1` minute(s)

Then the response should equal to empty string
