#!/usr/bin/env node
// tools/powerplan-mcp/verify-replay.mjs
//
// Cross-checks the Storm Replay counter (lib/app/replay/replay.ts) against the
// PowerPlan MCP server. For every simulated frame it sums county_summary's
// zip_sum_power_dependent and masked_zip_count over the counties in outage and
// compares them with the replay engine's own counter.
//
//   node tools/powerplan-mcp/verify-replay.mjs
//
// Requires Node 22.6+ (imports a .ts module via type stripping).

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

import { loadData } from "./lib.mjs";
import {
  parseReplayFile,
  replayCounter,
  statewideTotal,
} from "../../lib/app/replay/replay.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");

const replay = parseReplayFile(
  JSON.parse(readFileSync(join(ROOT, "data", "sim-storm-replay.json"), "utf8")),
);
const zips = loadData().zips.map((z) => ({
  zip: z.zip,
  countyFips: z.county_fips,
  powerDependentDme: { value: z.power_dependent_dme, masked: z.power_dependent_dme === 11 },
}));

const client = new Client({ name: "verify-replay", version: "0.1.0" });
await client.connect(
  new StdioClientTransport({ command: process.execPath, args: [join(HERE, "server.mjs")] }),
);

const cache = new Map();
async function county(fips) {
  if (!cache.has(fips)) {
    const r = await client.callTool({ name: "county_summary", arguments: { county: fips } });
    cache.set(fips, JSON.parse(r.content[0].text));
  }
  return cache.get(fips);
}

let allMatch = true;
console.log("hour | engine total | MCP sum | masked engine/MCP | match");
for (const f of replay.frames) {
  const c = replayCounter(f, zips);
  let mcpSum = 0;
  let mcpMasked = 0;
  for (const cc of f.counties.filter((x) => x.status === "outage")) {
    const s = await county(cc.fips);
    mcpSum += s.zip_sum_power_dependent;
    mcpMasked += s.masked_zip_count;
  }
  const ok = c.total === mcpSum && c.maskedZipCount === mcpMasked;
  allMatch &&= ok;
  console.log(
    `${String(f.hour).padStart(4)} | ${String(c.total).padStart(12)} | ${String(mcpSum).padStart(7)} | ${String(c.maskedZipCount).padStart(6)}/${mcpMasked} | ${ok ? "yes" : "NO"}`,
  );
}
console.log(`statewide total: ${statewideTotal(zips)} | all frames match: ${allMatch}`);
await client.close();
if (!allMatch) process.exitCode = 1;
