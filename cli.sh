#!/usr/bin/env bash

export NODE_NO_WARNINGS=1
node --experimental-transform-types ./cli/cli.ts "$@"
