# Device to websocket

> As the author of a software component  
> I want to verify that device can connect and publish a message to nRF Cloud
> infrastructure. The device messages should > be delivered to website though
> websocket protocol

## Background

Given There is a device as this JSON

```json
{
  "id": "nrf-test-device-id",
  "deviceId": "nrf-test-device-id",
  "secret": "my-secret",
  "name": "nrf-test-device-id",
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

## Verify a device sends a message to nRF Cloud, then I can receive the message via website

When I connect websocket with code `my-secret`

And a device with id `nrf-test-device-id` publishes to topic
`m/d/nrf-test-device-id/d2c` with a message as this JSON

```json
{
  "appId": "GROUND_FIX",
  "messageType": "DATA",
  "data": {
    "doReply": false,
    "wifi": {
      "accessPoints": [
        {
          "macAddress": "fd:70:40:b9:58:dc"
        },
        {
          "macAddress": "c5:ab:c7:55:8d:e3"
        }
      ]
    },
    "lte": [
      {
        "mnc": 260,
        "mcc": 310,
        "eci": 21858829,
        "tac": 333,
        "rsrp": -157,
        "rsrq": -34.5,
        "earfcn": 41490,
        "nmr": [
          {
            "pci": 143,
            "earfcn": 41490,
            "rsrp": -44,
            "rsrq": -3.5
          }
        ]
      }
    ]
  }
}
```

Then the response should equal to this JSON

```json
{
  "appId": "GROUND_FIX",
  "messageType": "DATA",
  "data": {
    "doReply": false,
    "wifi": {
      "accessPoints": [
        {
          "macAddress": "fd:70:40:b9:58:dc"
        },
        {
          "macAddress": "c5:ab:c7:55:8d:e3"
        }
      ]
    },
    "lte": [
      {
        "mnc": 260,
        "mcc": 310,
        "eci": 21858829,
        "tac": 333,
        "rsrp": -157,
        "rsrq": -34.5,
        "earfcn": 41490,
        "nmr": [
          {
            "pci": 143,
            "earfcn": 41490,
            "rsrp": -44,
            "rsrq": -3.5
          }
        ]
      }
    ]
  }
}
```

And I close connection
