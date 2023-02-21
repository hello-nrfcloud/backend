import type { Argv } from "yargs";
import yargs from "yargs/yargs";
import { initializeMQTTBridge } from "./initialize.js";

await yargs(process.argv.splice(2))
  .command(
    "$0 <apiKey>",
    "Initialize certificates used in MQTT bridge",
    (yargs: Argv) => {
      return yargs
        .positional("apiKey", {
          type: "string",
          description: "Your nRF Cloud apiKey",
          demandOption: true,
        })
        .option("endpoint", {
          type: "string",
          description: "nRF Cloud endpoint",
          default: "https://api.nrfcloud.com",
          alias: "e",
        })
        .option("reset", {
          type: "boolean",
          default: false,
          description:
            "Regenerate all credentials. This will regenerate your nRF Cloud account device certificates",
        });
    },
    initializeMQTTBridge
  )
  .help().argv;
