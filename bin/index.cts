import yargs, { Argv } from "yargs";
import { initializeMQTTBridge } from "./initialize.js";

yargs
  .command(
    "$0 <apiKey>",
    "Initialize certificates used in MQTT bridge",
    (yargs: Argv) => {
      return yargs
        .positional("apiKey", {
          type: "string",
          description: "Your Nrfcloud apiKey",
          demandOption: true,
        })
        .option("endpoint", {
          type: "string",
          description: "Nrfcloud endpoint",
          default: "https://api.nrfcloud.com",
          alias: "e",
        })
        .option("reset", {
          type: "boolean",
          default: false,
          description:
            "Regenerate all credentials. This will regenerate your nrfcloud account device certificates",
        });
    },
    initializeMQTTBridge
  )
  .help().argv;
