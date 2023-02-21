const debug = require("debug")("processor:mqtt");
const { faker } = require("@faker-js/faker");

function generateSensorVariables(context, ee, done) {
  context.vars["mqtt_temperature"] = faker.random.numeric(2);
  context.vars["mqtt_ts"] = Date.now();
  context.vars["mqtt_ip"] = faker.internet.ipv4();

  return done();
}

module.exports = {
  generateSensorVariables,
};
