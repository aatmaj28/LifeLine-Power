// lib/app/share.ts
//
// Builds the plain-text body used for sharing / copying a resident's Outage
// Plan. The resident's data lives only in the browser (localStorage); the
// share text is assembled from those in-memory fields and is handed to
// `navigator.share` or copy-to-clipboard.
//
// CRITICAL (Property 5 / Requirement 5.9): the output must never encode the
// resident's contact names, contact phone numbers, or device list into a URL.
// The simplest safe guarantee is to include no URL at all — this file builds
// the text purely from plan fields and emits plain prose only.

import type { ResidentPlan } from "./plan-storage";

/**
 * Builds a readable, plain-text summary of a resident's Outage Plan from their
 * browser-held data.
 *
 * The text is intentionally URL-free so that no resident PII (contact names,
 * phone numbers, or device list) can leak through a query string or fragment.
 *
 * @param plan The resident's plan, held in the browser only.
 * @returns A plain-text share body containing no URLs.
 */
export function buildShareText(plan: ResidentPlan): string {
  const lines: string[] = [];

  lines.push("My Outage Plan");
  lines.push("");

  if (plan.zip) {
    lines.push(`ZIP code: ${plan.zip}`);
  }

  if (plan.deviceTypes.length > 0) {
    lines.push(`Devices: ${plan.deviceTypes.join(", ")}`);
  }

  lines.push(`Backup battery: about ${plan.batteryHours} hours (based on what you entered)`);

  if (plan.contacts.length > 0) {
    lines.push("");
    lines.push("Emergency contacts:");
    for (const contact of plan.contacts) {
      const name = contact.name.trim();
      const phone = contact.phone.trim();
      if (name && phone) {
        lines.push(`- ${name}: ${phone}`);
      } else if (name) {
        lines.push(`- ${name}`);
      } else if (phone) {
        lines.push(`- ${phone}`);
      }
    }
  }

  lines.push("");
  lines.push("If your device stops and you are in danger, call 911.");
  lines.push("Talk to your doctor or equipment supplier about your backup plan.");

  return lines.join("\n");
}
