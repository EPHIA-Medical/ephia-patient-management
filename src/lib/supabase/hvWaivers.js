import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./client";
import { HV_WAIVER_TEXT, HV_WAIVER_VERSION, sha256Hex } from "../../utils/hvRules";

// Records that the doctor confirmed the § 2 GOÄ notice (append-only, no patient data).
// Awaited and throws on failure: a waived Rechnung must never be saved without this record.
export async function recordHvWaiver(accessToken, { context, maxSteigerung }) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/hv_waivers`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${accessToken}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      text_version: HV_WAIVER_VERSION,
      text_sha256: await sha256Hex(HV_WAIVER_TEXT),
      context,
      max_steigerung: maxSteigerung != null ? Math.round(maxSteigerung * 100) / 100 : null,
    }),
  });
  if (!res.ok) throw new Error((await res.text()) || `HTTP ${res.status}`);
}
