import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./supabase/client";

// Usage events go to public.analytics_events (migration 0008), which only
// accepts inserts from a logged-in account. Calls without an explicit token
// use the stored session; with no session at all (e.g. right after sign-up,
// before the e-mail is confirmed) the event is skipped.
function storedAccessToken() {
  try {
    return JSON.parse(localStorage.getItem("ephia_session") || "null")?.access_token || null;
  } catch (_) {
    return null;
  }
}

export function trackEvent(eventName, metadata = {}, accessToken = null) {
  try {
    const token = accessToken || storedAccessToken();
    if (!token) return;
    fetch(`${SUPABASE_URL}/rest/v1/analytics_events`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ event_name: eventName, metadata }),
    }).catch(() => {}); // Fire-and-forget, never block UI
  } catch (_) {
    // Analytics should never crash the app
  }
}
