#!/usr/bin/env bash

export NODE_NO_WARNINGS=1
node --loader tsx ./cli/cli.ts "$@"
