import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import type { NextAuthOptions } from "next-auth";
import { pool } from "./db";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const { rows } = await pool.query(
          `SELECT u.id, u.email, u.name, u.password_hash, u.role, u.org_id, o.name as org_name
           FROM users u JOIN organizations o ON u.org_id = o.id
           WHERE u.email = $1`,
          [credentials.email]
        );

        if (rows.length === 0) return null;

        const user = rows[0];
        const valid = await bcrypt.compare(credentials.password, user.password_hash);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          orgId: user.org_id,
          orgName: user.org_name,
          role: user.role,
        };
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.orgId = (user as any).orgId;
        token.orgName = (user as any).orgName;
        token.role = (user as any).role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).orgId = token.orgId;
        (session.user as any).orgName = token.orgName;
        (session.user as any).role = token.role;
      }
      return session;
    },
  },
};
