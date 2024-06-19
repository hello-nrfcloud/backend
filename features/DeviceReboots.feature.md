---
exampleContext:
  fingerprint: 92b.y7i24q
  fingerprint_deviceId: 33ec3829-895f-4265-a11f-6c617a2e6b87
  ts: 1694503339523
  tsISO: 2023-09-12T00:00:00.000Z
  memfaultApiEndpoint: https://api.memfault.com
---

# Device reboots

> The backend will fetch reboots from Memfault for a device that is observed.

## Background

Given I have the fingerprint for a `PCA20065` device in `fingerprint`

And I store `$millis()` into `ts`

And I store `$fromMillis(${ts})` into `tsISO`

And this HTTP API Mock response for
`GET ${memfaultApiEndpoint}/api/v0/organizations/nordic-semiconductor-asa123456/projects/hello-nrfcloud-com/devices/${fingerprint_deviceId}/reboots`
is queued

```
HTTP/1.1 200 OK
Content-Type: application/json

{
  "data": [
    {
      "time": "${tsISO}",
      "software_version": {
        "version": "2.0.1+thingy91x",
        "archived": false,
        "software_type": { "id": 32069, "name": "hello.nrfcloud.com" },
        "id": 570762
      },
      "type": "memfault",
      "mcu_reason_register": 65536,
      "reason": 8
    }
  ],
  "paging": {
    "total_count": 1,
    "item_count": 1,
    "per_page": 10,
    "page": 1,
    "page_count": 1
  }
}


```

## The reboots are fetched

> For observed devices, the reboots are fetched, and the latest is published.

When I connect to the websocket using fingerprint `${fingerprint}`

Soon I should receive a message on the websocket that matches after 20 retries

```json
{
  "@context": "https://github.com/hello-nrfcloud/proto/lwm2m/object/update",
  "ObjectID": 14250,
  "Resources": {
    "0": 8,
    "99": "$number{$floor(ts/1000)}"
  }
}
```

## The latest reboot should be persisted in the device shadow

Given I reconnect to the websocket using fingerprint `${fingerprint}`

Soon I should receive a message on the websocket that matches

```json
{
  "@context": "https://github.com/hello-nrfcloud/proto/shadow",
  "reported": [
    {
      "ObjectID": 14250,
      "Resources": {
        "0": 8,
        "99": "$number{$floor(ts/1000)}"
      }
    }
  ]
}
```
