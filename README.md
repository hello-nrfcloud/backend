# `hello.nrfcloud.com` backend

[![GitHub Actions](https://github.com/hello-nrfcloud/backend/workflows/Test%20and%20Release/badge.svg)](https://github.com/hello-nrfcloud/backend/actions/workflows/test-and-release.yaml)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)
[![Renovate](https://img.shields.io/badge/renovate-enabled-brightgreen.svg)](https://renovatebot.com)
[![Commitizen friendly](https://img.shields.io/badge/commitizen-friendly-brightgreen.svg)](http://commitizen.github.io/cz-cli/)
[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg)](https://github.com/prettier/prettier/)
[![ESLint: TypeScript](https://img.shields.io/badge/ESLint-TypeScript-blue.svg)](https://github.com/typescript-eslint/typescript-eslint)

Cloud backend for [`hello.nrfcloud.com`](https://github.com/hello-nrfcloud/web)
developed using [AWS CDK](https://aws.amazon.com/cdk) in
[TypeScript](https://www.typescriptlang.org/).

## Installation in your AWS account

### Setup

Provide your AWS credentials, for example using the `.envrc` (see
[the example](.envrc.example)).

Install the dependencies:

```bash
npm ci
```

### Run once

To setup MQTT bridge, you have to run the below command to generate a
certificate used by MQTT broker to connect nRF Cloud under your account. So, you
need to prepare nRF Cloud API key.

```bash
./cli.sh configure thirdParty/<account>/apiKey <API key>
./cli.sh initialize-nrfcloud-account <account>
./cli.sh create-health-check-device <account>
```

**Note** Currently the supported accounts are `exeger` and `nordic`

### Deploy

```bash
npx cdk bootstrap # if this is the first time you use CDK in this account
npx cdk deploy
```

## What messages MQTT bridge forwards

According to nRF Cloud documentation,
[Setting up a message bridge](https://docs.nrfcloud.com/Devices/Messages/SetupMessageBridge/),
all messages under `<stage>/<team id>/m/#` are bridged. Since the messages are
forwarded from nRF Cloud, therefore all messages are following the protocol
described
[here](https://github.com/nRFCloud/application-protocols/tree/v1/schemas).

**Note** Shadow data will **NOT** be forwarded to MQTT bridge since they are
using topic as `$aws/things/${deviceId}/shadow/update`

## Websocket Protocol

Message received from MQTT bridge will be published to websocket connection that
associates with the same device id.

Messages will be converted using
[`@hello.nrfcloud.com/proto`](https://github.com/hello-nrfcloud/proto).

## Device Simulator

You can create a simulated device for particular nRF Cloud account using the
CLI:

```bash
./cli.sh register-simulator-device <account>
```

This will create a new device, register its public key with nRF Cloud and its
fingerprint in the device database.

Afterwards you can run the simulator using

```bash
./cli.sh simulate-device <deviceId>
```

which will send simulated data to nRF Cloud.

## Shadow fetcher configuration

To customize the frequency of the shadow fetcher for each model, you can modify
the configuration using

```bash
./cli.sh set-shadow-fetcher-config <modelName> <value>
```

The value parameter can be specified in the following formats:

- interval
- interval:count
- interval:count, interval:count

Here, `interval` refers to the interval in seconds between fetching the shadow
of a device, and `count` represents the number of iterations.

### Examples

- `10` will fetch the shadow of a device every 10 seconds indefinitely.
- `5:30` will fetch the shadow of a device every 5 seconds indefinitely.
- `5:30, 30` will fetch the shadow of a device every 5 seconds for 30 times,
  then switch to fetching it every 30 seconds thereafter.
- `5:30, 30:20, 60` will fetch the shadow of a device every 5 seconds for 30
  times, then switch to fetching it every 30 seconds for another 20 times.
  Finally, fetching the shadow every 60 seconds indefinitely

## Continuous Integration

To run continuous integration tests, deploy the CI application **in a seperate
account**:

```bash
npx cdk --app 'npx tsx --no-warnings cdk/ci.ts' deploy
```

and provide the Role ARN to GitHub Actions:

```bash
CI_ROLE=`aws cloudformation describe-stacks --stack-name ${STACK_NAME:-hello-nrfcloud-backend}-ci | jq -r '.Stacks[0].Outputs[] | select(.OutputKey == "ciRoleArn") | .OutputValue'`
gh secret set AWS_ROLE --env ci --body $CI_ROLE
```
