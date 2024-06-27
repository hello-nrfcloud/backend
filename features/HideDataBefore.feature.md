---
exampleContext:
  fingerprint: 92b.y7i24q
  fingerprint_deviceId: oob-352656108602296
  APIURL: https://api.hello.nordicsemi.cloud
  ts: 1694503339523
  tsISO: 2023-09-12T00:00:00.000Z
---

# Hide past data

> A use can register their wish that data published by the device should be
> hidden.
>
> This is effective until the current date when the user registers this wish.
> Date published later will be accessible.

## Background

Given I have the fingerprint for a `PCA20065` device in `fingerprint`

And I store `$millis()` into `ts`

And I store `$fromMillis(${ts})` into `tsISO`

## Device publishes data

When the device `${fingerprint_deviceId}` does a `POST` to this CoAP resource
`/msg/d2c/raw` with this SenML payload

```json
[
  {
    "bn": "14202/0/",
    "bt": "$number{$floor(ts/1000)}",
    "n": "1",
    "v": "3.40141"
  }
]
```

## Fetch the published data

When I `GET`
`${APIURL}/device/${fingerprint_deviceId}/history/14202/0?fingerprint=${fingerprint}&timeSpan=lastDay`
retrying 10 times

Then I should receive a
`https://github.com/hello-nrfcloud/proto/lwm2m/object/history` response

And `{"len": $count(partialInstances)}` of the last response should match

```json
{ "len": 1 }
```

## Register the wish to hide past data

When I `POST`
`${APIURL}/device/${fingerprint_deviceId}/hideDataBefore?fingerprint=${fingerprint}`

Then the status code of the last response should be `200`

## Confirm change

When I `GET` `${APIURL}/device?fingerprint=${fingerprint}`

Then the last response should match

```json
{
  "@context": "https://github.com/hello-nrfcloud/proto/deviceIdentity",
  "id": "${fingerprint_deviceId}"
}
```

And `{"ok": hideDataBefore >= "${tsISO}"}` of the last response should match

```json
{ "ok": true }
```

## Fetch the published data again

> This time the historical data should not be available

When I `GET`
`${APIURL}/device/${fingerprint_deviceId}/history/14202/0?fingerprint=${fingerprint}&timeSpan=lastDay`
retrying 10 times

Then I should receive a
`https://github.com/hello-nrfcloud/proto/lwm2m/object/history` response

And `{"len": $count(partialInstances)}` of the last response should match

```json
{ "len": 0 }
```
