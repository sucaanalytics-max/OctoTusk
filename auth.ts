import NextAuth from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  providers: [
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID!,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET!,
      issuer: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}/v2.0`,
    }),
  ],
  callbacks: {
    signIn({ profile }) {
      // Only allow @tuskinvest.com emails
      const email = String(profile?.email || profile?.preferred_username || "");
      return email.endsWith("@tuskinvest.com");
    },
    session({ session, token }) {
      if (session.user && token.email) {
        session.user.email = String(token.email);
      }
      return session;
    },
    jwt({ token, profile }) {
      if (profile) {
        token.email = String(profile.email || profile.preferred_username || "");
      }
      return token;
    },
  },
  pages: {
    signIn: "/",
    error: "/",
  },
});
