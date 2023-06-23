#!/bin/sh

results=$(mosquitto_sub -p 1883 -t "\$SYS/broker/connection/#" -i health-check -C 2 -W 3 2>/dev/null)
expected_results="1"$'\n'"1"

if [[ "$results" == "$expected_results" ]]; then
  echo "Both commands were successful."
else
  echo "One or both commands failed."
  exit 1
fi