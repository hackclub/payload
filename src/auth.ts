import NextAuth from "next-auth"
import { DrizzleAdapter } from "@auth/drizzle-adapter"
import { db } from "./db"
import * as schema from "./db/schema"
import { env } from "./env"

type CachetProfile = {
  displayName?: string;
  imageUrl?: string;
};

type UserWithSlackId = {
  slackId?: string | null;
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: DrizzleAdapter(db, {
    usersTable: schema.users,
    accountsTable: schema.accounts,
    sessionsTable: schema.sessions,
    verificationTokensTable: schema.verificationTokens,
  }),
  providers: [
    {
      id: "hackclub",
      name: "Hack Club",
      type: "oidc",
      issuer: "https://auth.hackclub.com",
      clientId: env.HACKCLUB_OIDC_CLIENT_ID,
      clientSecret: env.HACKCLUB_OIDC_CLIENT_SECRET,
      authorization: {
        params: {
          scope: "openid profile email slack_id",
          ...(env.HACKCLUB_OIDC_REDIRECT_URI
            ? { redirect_uri: env.HACKCLUB_OIDC_REDIRECT_URI }
            : {}),
        },
      },
      async profile(profile) {
        let name = profile.name;
        let image = profile.picture;
        try {
          if (profile.slack_id) {
             const res = await fetch(`https://cachet.dunkirk.sh/users/${profile.slack_id}`);
             if (res.ok) {
               const data = (await res.json()) as CachetProfile;
               if (data.displayName) name = data.displayName;
               if (data.imageUrl) image = data.imageUrl;
             }
          }
        } catch (e) {
          console.error("Failed to fetch Cachet profile", e);
        }
        
        return {
          id: profile.sub,
          name: name,
          email: profile.email,
          image: image,
          slackId: profile.slack_id as string,
        }
      },
    },
  ],
  callbacks: {
    async session({ session, user }) {
      if (session.user) {
        (session.user as typeof session.user & UserWithSlackId).slackId = (
          user as typeof user & UserWithSlackId
        ).slackId;
      }
      return session;
    },
  },
})
