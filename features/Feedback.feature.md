---
exampleContext:
  feedbackWebhookURL: https://acme.webhook.office.com/webhookb2/ff5da9b3-7653-4279-a8b5-1eeca7ee33bb
  APIURL: https://api.hello.nordicsemi.cloud
---

# Feedback

> Users can provide feedback using a form on the website.

## Background

Given this HTTP API Mock response for `POST ${feedbackWebhookURL}` is queued

```
HTTP/1.1 202 OK
```

And I have a random email in `email`

## User submits feedback

When I `POST` to `${APIURL}/feedback` with

```json
{
  "email": "${email}",
  "stars": 4,
  "suggestion": "None, everything worked well!",
  "browser": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36"
}
```

Then the status code of the last response should be `201`

## The webhook was called

Soon the HTTP API Mock should have been called with

```
POST /webhook.office.com/ HTTP/1.1
content-type: application/json; charset=utf-8

{
  "summary": "New feedback",
  "themeColor": "00a9ce",
  "title": "New feedback received",
  "sections": [
    {
      "facts": [
        {
          "name": "Rating",
          "value": "★★★★☆"
        },
        {
          "name": "Email",
          "value": "${email}"
        },
        {
          "name": "Browser",
          "value": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36"
        }
      ],
      "text": "None, everything worked well!"
    }
  ]
}
```
