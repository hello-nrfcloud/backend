# nRF Guide

[![GitHub Actions](https://github.com/NordicSemiconductor/nrf.guide-backend/workflows/Test%20and%20Release/badge.svg)](https://github.com/NordicSemiconductor/nrf.guide-backend/actions/workflows/test-and-release.yaml)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)
[![Renovate](https://img.shields.io/badge/renovate-enabled-brightgreen.svg)](https://renovatebot.com)
[![Mergify Status](https://img.shields.io/endpoint.svg?url=https://api.mergify.com/v1/badges/NordicSemiconductor/nrf.guide-backend)](https://mergify.io)
[![Commitizen friendly](https://img.shields.io/badge/commitizen-friendly-brightgreen.svg)](http://commitizen.github.io/cz-cli/)
[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg)](https://github.com/prettier/prettier/)
[![ESLint: TypeScript](https://img.shields.io/badge/ESLint-TypeScript-blue.svg)](https://github.com/typescript-eslint/typescript-eslint)

Cloud backend for [nRF.guide](https://github.com/NordicSemiconductor/nrf.guide)
developed using [AWS CDK](https://aws.amazon.com/cdk) in
[TypeScript](https://www.typescriptlang.org/).

## Installation in your AWS account

### Setup

Provide your AWS credentials, for example using the `.envrc` (see
[the example](.envrc.example)).

Install the dependencies:

```
npm ci
```

### Run once

To setup MQTT bridge, you have to run the below command to generate a
certificate used by MQTT broker to connect nRF Cloud under your account. So, you
need to prepare nRF Cloud API key.

```
npx tsx bin/index.cts <API key>
```

### Deploy

```
npx cdk deploy
```

## What MQTT bridge will forward to IoT core

According to nRF Cloud documentation,
[Setting up a message bridge](https://docs.nrfcloud.com/Devices/Messages/SetupMessageBridge/),
all messages under `<stage>/<team id>/m/#` are bridged. Since the messages are
forwarded from nRF Cloud, therefore all messages are following the protocol
described
[here](https://github.com/nRFCloud/application-protocols/tree/v1/schemas).
