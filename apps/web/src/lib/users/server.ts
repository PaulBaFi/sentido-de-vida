import "server-only";
import { createServerAuthClient } from "@/lib/supabase/server";
import { dashboardProfile, type DashboardProfile } from "./profile";

export async function getDashboardProfile(): Promise<DashboardProfile> {
  try {
    const { auth } = await createServerAuthClient();
    return await dashboardProfile(auth, process.env.USERS_API_URL);
  } catch { return { status: "unavailable" }; }
}
