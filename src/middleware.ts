import { withAuth } from "next-auth/middleware";

export default withAuth({
  pages: {
    signIn: "/login",
  },
});

export const config = {
  matcher: [
    "/",
    "/new",
    "/dashboard/:path*",
    "/review/:path*",
    "/questions/:path*",
    "/compare/:path*",
    "/team/:path*",
    "/templates/:path*",
  ],
};
