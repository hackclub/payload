import NextAuth from "next-auth"
import { DrizzleAdapter } from "@auth/drizzle-adapter"
import type { Adapter } from "next-auth/adapters"
import { and, eq, isNull, notExists } from "drizzle-orm"
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

const drizzleAdapter = DrizzleAdapter(db, {
  usersTable: schema.users,
  accountsTable: schema.accounts,
  sessionsTable: schema.sessions,
  verificationTokensTable: schema.verificationTokens,
})

// a first sign-in takes over the row fiona made for them (no email, no account), so they aren't two people
const adapter: Adapter = {
  ...drizzleAdapter,
  async createUser(user) {
    const slackId = "slackId" in user && typeof user.slackId === "string" ? user.slackId : null
    if (slackId) {
      const [claimed] = await db
        .update(schema.users)
        .set({ name: user.name, email: user.email, emailVerified: user.emailVerified, image: user.image })
        .where(
          and(
            eq(schema.users.slackId, slackId),
            isNull(schema.users.email),
            notExists(db.select().from(schema.accounts).where(eq(schema.accounts.userId, schema.users.id))),
          ),
        )
        .returning()
      if (claimed) return { ...claimed, email: claimed.email ?? user.email }
    }
    if (!drizzleAdapter.createUser) throw new Error("the Drizzle adapter can't create users")
    return drizzleAdapter.createUser(user)
  },
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter,
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
          scope: "openid slack_id",
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
