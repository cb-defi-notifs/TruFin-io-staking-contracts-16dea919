const fs = require("fs");
const path = require("path");
const envfile = require("envfile");

// Helpers

export const writeEnv = (k, v) => {
  const fullPath = path.resolve("../../.env");
  let parsedFile = envfile.parse(fs.readFileSync(fullPath).toString());
  parsedFile[k] = v;
  let configString = envfile.stringify(parsedFile);
  fs.writeFileSync(fullPath, configString);
  console.log(`Saved value ${v} to key ${k} in .env file`);
}
