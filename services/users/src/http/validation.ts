import type { OwnProfileResponse } from "@sentido/contracts";
import { isRecord, isUuid } from "../domain/profile.ts";

export function bearerToken(headers: Headers): string | null {
  const value = headers.get("authorization");
  if (!value || value.length > 8192) return null;
  const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(value);
  return match?.[1] ?? null;
}
export function validOwnProfileResponse(value: unknown): value is OwnProfileResponse {
  if (!isRecord(value) || Object.keys(value).join() !== "data" || !isRecord(value.data) ||
      Object.keys(value.data).join() !== "profile" || !isRecord(value.data.profile)) return false;
  const profile = value.data.profile;
  return Object.keys(profile).length === 2 && Object.hasOwn(profile, "id") &&
    Object.hasOwn(profile, "displayName") && isUuid(profile.id) &&
    typeof profile.displayName === "string" && profile.displayName.trim().length > 0 &&
    profile.displayName.length <= 201;
}
export function invalidOwnProfileRequest(request: Request) {
  const url = new URL(request.url);
  return url.search.length > 0 ||
    ["x-user-id", "x-profile-id", "x-role", "x-roles"].some(header => request.headers.has(header)) ||
    request.headers.has("transfer-encoding") ||
    (request.headers.has("content-length") && request.headers.get("content-length") !== "0");
}
