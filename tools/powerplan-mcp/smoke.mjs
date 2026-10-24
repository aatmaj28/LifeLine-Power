#!/usr/bin/env node
// tools/powerplan-mcp/smoke.mjs
//
// Talks to server.mjs over real MCP stdio and calls a tool. Used as a smoke
// test and as a quick query client while building features.
//
//   node smoke.mjs                         list tools + a sample call of each
//   node smoke.mjs county_summary '{"county":"Plymouth"}'
//   node smoke.mjs top_zips '{"county":"Barnstable","limit":5}'
//   node smoke.mjs zip_detail '{"zip":"02360"}'

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [join(HERE, "server.mjs")],
});
const client = new Client({ name: "powerplan-smoke", version: "0.1.0" });
await client.connect(transport);

const [, , toolName, rawArgs] = process.argv;

function print(result) {
  for (const part of result.content ?? []) {
    if (part.type === "text") console.log(part.text);
  }
  if (result.isError) process.exitCode = 1;
}

if (toolName) {
  print(await client.callTool({ name: toolName, arguments: rawArgs ? JSON.parse(rawArgs) : {} }));
} else {
  const { tools } = await client.listTools();
  console.log("tools:", tools.map((t) => t.name).join(", "));
  print(await client.callTool({ name: "county_summary", arguments: { county: "Plymouth" } }));
  print(await client.callTool({ name: "top_zips", arguments: { limit: 3 } }));
  print(await client.callTool({ name: "zip_detail", arguments: { zip: "02360" } }));
  const bad = await client.callTool({ name: "zip_detail", arguments: { zip: "99999" } });
  console.log("unknown ZIP isError:", bad.isError === true);
}

await client.close();
