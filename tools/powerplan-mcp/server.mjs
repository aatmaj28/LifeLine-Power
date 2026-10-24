#!/usr/bin/env node
// tools/powerplan-mcp/server.mjs
//
// A small stdio MCP server over PowerPlan's emPOWER CSVs. Tools:
//   county_summary(county)        one county's figures
//   top_zips(county?, limit)      ZIPs ranked by power-dependent count
//   zip_detail(zip)               one ZIP's figures
//
// Read-only. Data is aggregated, de-identified Medicare data; 11 means
// "11 or fewer". Unknown inputs return an error, never invented numbers.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { countySummary, loadData, topZips, zipDetail } from "./lib.mjs";

const data = loadData(process.env.POWERPLAN_DATA_DIR || undefined);

function reply(result) {
  if (!result.ok) {
    return { isError: true, content: [{ type: "text", text: result.error }] };
  }
  return { content: [{ type: "text", text: JSON.stringify(result.value, null, 2) }] };
}

const server = new McpServer({ name: "powerplan-data", version: "0.1.0" });

server.registerTool(
  "county_summary",
  {
    title: "County summary",
    description:
      "emPOWER figures for one Massachusetts county (name like 'Plymouth' or FIPS like '25023'): Medicare beneficiaries, power-dependent count, related services, and ZIP totals.",
    inputSchema: { county: z.string().describe("County name or 5-digit FIPS") },
  },
  async ({ county }) => reply(countySummary(data, county)),
);

server.registerTool(
  "top_zips",
  {
    title: "Top ZIPs",
    description:
      "Massachusetts ZIPs ranked by power-dependent Medicare beneficiaries, optionally within one county.",
    inputSchema: {
      county: z.string().optional().describe("Optional county name or FIPS"),
      limit: z.number().int().min(1).max(100).default(10).describe("How many ZIPs (1-100)"),
    },
  },
  async ({ county, limit }) => reply(topZips(data, { county, limit })),
);

server.registerTool(
  "zip_detail",
  {
    title: "ZIP detail",
    description: "emPOWER figures for one Massachusetts ZIP code.",
    inputSchema: { zip: z.string().describe("5-digit ZIP code") },
  },
  async ({ zip }) => reply(zipDetail(data, zip)),
);

await server.connect(new StdioServerTransport());
