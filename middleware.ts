export { default } from "next-auth/middleware";

export const config = {
  matcher: ["/", "/new", "/dashboard/:path*", "/review/:path*", "/questions/:path*", "/compare/:path*"],
};
