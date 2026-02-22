export { auth as middleware } from "./auth";

export const config = {
  matcher: ["/dashboard/:path*", "/api/quotes/:path*", "/api/holdings/:path*", "/api/refresh/:path*"],
};
