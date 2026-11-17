import { NextResponse } from "next/server.js";

/** Preservar cookies de renovación incluso cuando la respuesta es una redirección. */
export function privateAuthResponse(source: NextResponse, destination?: URL) {
  const response = destination ? NextResponse.redirect(destination) : source;
  if (destination) {
    for (const cookie of source.cookies.getAll()) response.cookies.set(cookie);
  }
  response.headers.set("Cache-Control", "private, no-cache, no-store, must-revalidate, max-age=0");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  return response;
}
