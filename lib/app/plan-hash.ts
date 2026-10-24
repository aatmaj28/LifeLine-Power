// lib/app/plan-hash.ts
//
// Encode a resident plan into a URL fragment ("#plan=...") and back. The
// fragment is the part of a URL after "#": browsers never send it to a server,
// so a link like /plan#plan=... carries the plan from one device to another
// without the plan ever leaving the browser over the network.
//
// Used only by the fridge card's QR code, which the resident chooses to print.
// The card warns: "This code contains your plan. Share it only with people you
// trust." Decoding reuses deserializePlan so validation stays in one place, and
// it never throws: a damaged or hostile hash simply returns null.

import { deserializePlan, serializePlan, type ResidentPlan } from "./plan-storage";

export const PLAN_HASH_KEY = "plan";

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((text.length + 3) % 4);
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

/** "plan=<base64url(JSON)>" — put after "#" in a /plan link. */
export function encodePlanHash(plan: ResidentPlan): string {
  const bytes = new TextEncoder().encode(serializePlan(plan));
  return `${PLAN_HASH_KEY}=${toBase64Url(bytes)}`;
}

/**
 * Read a plan from a location hash ("#plan=..." or "plan=..."). Returns null for
 * anything missing, malformed, or not a valid plan. Never throws.
 */
export function decodePlanHash(hash: string): ResidentPlan | null {
  try {
    const raw = String(hash ?? "").replace(/^#/, "");
    let encoded: string | undefined;
    for (const part of raw.split("&")) {
      const eq = part.indexOf("=");
      if (eq > 0 && part.slice(0, eq) === PLAN_HASH_KEY) {
        encoded = part.slice(eq + 1);
        break;
      }
    }
    if (!encoded) return null;
    const bytes = fromBase64Url(encoded);
    if (!bytes) return null;
    const json = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return deserializePlan(json);
  } catch {
    return null;
  }
}

/** Full link for a QR code: <origin>/plan#plan=... */
export function planLink(origin: string, plan: ResidentPlan): string {
  return `${origin.replace(/\/+$/, "")}/plan#${encodePlanHash(plan)}`;
}
