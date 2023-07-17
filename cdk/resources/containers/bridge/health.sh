#!/bin/sh

MQ_BRIDGE_COUNT=${MQ_BRIDGE_COUNT:-0}

results=$(mosquitto_sub -p 1883 -t "\$SYS/broker/connection/#" -i health-check -C $MQ_BRIDGE_COUNT -W 3 2>/dev/null)
expected_results="1"
i=1
while [ $i -lt $MQ_BRIDGE_COUNT ]
do
  expected_results="${expected_results}"$'\n'"1"
  i=$((i + 1))
done

if [[ "$results" == "$expected_results" ]]; then
  echo "Both commands were successful."
else
  echo "One or both commands failed."
  exit 1
fi