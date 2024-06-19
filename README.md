# `hello.nrfcloud.com` backend

[![GitHub Actions](https://github.com/hello-nrfcloud/backend/workflows/Test%20and%20Release/badge.svg)](https://github.com/hello-nrfcloud/backend/actions/workflows/test-and-release.yaml)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)
[![Renovate](https://img.shields.io/badge/renovate-enabled-brightgreen.svg)](https://renovatebot.com)
[![@commitlint/config-conventional](https://img.shields.io/badge/%40commitlint-config--conventional-brightgreen)](https://github.com/conventional-changelog/commitlint/tree/master/@commitlint/config-conventional)
[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg)](https://github.com/prettier/prettier/)
[![ESLint: TypeScript](https://img.shields.io/badge/ESLint-TypeScript-blue.svg)](https://github.com/typescript-eslint/typescript-eslint)

Cloud backend for [`hello.nrfcloud.com`](https://github.com/hello-nrfcloud/web)
developed using [AWS CDK](https://aws.amazon.com/cdk) in
[TypeScript](https://www.typescriptlang.org/).

## Installation in your AWS account

### Setup

[Provide your AWS credentials](https://docs.aws.amazon.com/cli/latest/userguide/cli-chap-authentication.html).

### Install the dependencies

```bash
npm ci
```

The CoAP simulator is written in Golang, which needs to be
[present on the local system](https://go.dev/dl/).

### Run once

To setup MQTT bridge, you have to run the below command to generate a
certificate used by MQTT broker to connect nRF Cloud under your account. So, you
need to prepare nRF Cloud API key.

```bash
./cli.sh configure-nrfcloud-account <account> apiKey <API key>
./cli.sh initialize-nrfcloud-account <account>
./cli.sh create-health-check-device <account>
```

#### nRF Cloud Location Services Service Key

The single-cell geo-location features uses the nRF Cloud
[Ground Fix API](https://api.nrfcloud.com/v1#tag/Ground-Fix) which requires the
service to be enabled in the account's plan. Manage the account at
<https://nrfcloud.com/#/manage-plan>.

#### Memfault integration

The backend fetches device metrics from [Memfault](https://memfault.com/). For
this you need to configure the settings for your Memfault project:

```bash
./cli.sh configure-memfault organizationAuthToken <organizationAuthToken> # e.g. oat_18By8mEdkEj666666666666kIt9HwsMZ
./cli.sh configure-memfault organizationSlug <organizationSlug> # e.g. nordic-semiconductor-asa123456
./cli.sh configure-memfault projectSlug <projectSlug> # e.g. hello-nrfcloud-com
```

### Build the docker images

Some of the feature are run from docker containers, ensure they have been built
and published before deploying the solutions.

```bash
export MQTT_BRIDGE_CONTAINER_TAG=$(./cli.sh build-container mqtt-bridge)

# You can add these outputs to your .env file
echo MQTT_BRIDGE_CONTAINER_TAG=$MQTT_BRIDGE_CONTAINER_TAG
```

### Deploy

```bash
npx cdk bootstrap # if this is the first time you use CDK in this account
npx cdk deploy --all
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

## Adding another nRF Cloud team

The backend supports the integration with multiple nRF Cloud accounts.

Follow the steps above to set up the MQTT bridge for another account, then
trigger a deployment.

```bash
npx cdk deploy --all
```

List the configured accounts:

```bash
./cli.sh list-nrfcloud-accounts
```

## Continuous Deployment using GitHub Actions

After deploying the stack manually once,

- configure a GitHub Actions environment named `production`
- create the secret `AWS_ROLE` with the value
  `arn:aws:iam::<account ID>:role/<stack name>-cd` and a variable (use the
  `cdRoleArn` stack output)
- create the variable `AWS_REGION` with the value `<region>` (your region)
- create the variable `STACK_NAME` with the value `<stack name>` (your stack
  name)

to enable continuous deployment.

## Websocket Protocol

Message received from MQTT bridge will be published to websocket connection that
associates with the same device id.

Messages will be converted using
[`@hello.nrfcloud.com/proto`](https://github.com/hello-nrfcloud/proto).
