# Hack Club OIDC Integration

Source: <https://auth.hackclub.com/docs/oidc-guide>

## Endpoints

| Purpose | URL |
|---------|-----|
| Discovery | `https://auth.hackclub.com/.well-known/openid-configuration` |
| Authorize | `https://auth.hackclub.com/oauth/authorize` |
| Token | `https://auth.hackclub.com/oauth/token` |
| UserInfo | `https://auth.hackclub.com/oauth/userinfo` |

## Scopes Payload requests

```
openid profile email slack_id
```

- `openid` -> `sub`, e.g. `ident!abc123`
- `profile` -> `name`, `given_name`, `family_name`, `nickname`
- `email` -> `email`, `email_verified`
- `slack_id` -> key claim for allowlist, e.g. `U0123ABC`

Community-app scope ceiling is `openid profile email name slack_id verification_status`.
Payload stays within that.

## Avatar / picture

Hack Club Auth does not return a `picture` claim. To get the user's profile
image:

```
https://cachet.dunkirk.sh/users/{slack_id}/r
```

The `/r` suffix redirects to the actual image.

## Auth.js wiring

Use Auth.js v5 with a custom OIDC provider. Keep this in `src/auth.ts`.

```ts
import NextAuth from "next-auth";
import type { OIDCConfig } from "next-auth/providers";

type HackClubProfile = {
  sub: string;
  email?: string;
  name?: string;
  slack_id?: string;
};

const HackClubProvider: OIDCConfig<HackClubProfile> = {
  id: "hackclub",
  name: "Hack Club",
  type: "oidc",
  issuer: "https://auth.hackclub.com",
  wellKnown: "https://auth.hackclub.com/.well-known/openid-configuration",
  authorization: { params: { scope: "openid profile email slack_id" } },
  clientId: process.env.HACKCLUB_OIDC_CLIENT_ID,
  clientSecret: process.env.HACKCLUB_OIDC_CLIENT_SECRET,
  profile(profile) {
    if (!profile.slack_id) {
      throw new Error("Hack Club Auth did not return slack_id");
    }

    return {
      id: profile.sub,
      name: profile.name,
      email: profile.email,
      image: `https://cachet.dunkirk.sh/users/${profile.slack_id}/r`,
      slackId: profile.slack_id,
      oidcSub: profile.sub,
    };
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [HackClubProvider],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, profile }) {
      const hackClubProfile = profile as HackClubProfile | undefined;
      if (hackClubProfile?.slack_id) {
        token.slackId = hackClubProfile.slack_id;
        token.oidcSub = hackClubProfile.sub;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.slackId = token.slackId as string | undefined;
      session.user.oidcSub = token.oidcSub as string | undefined;
      return session;
    },
  },
});
```

Route handler:

```ts
// src/app/api/auth/[...nextauth]/route.ts
export { GET, POST } from "@/auth";
```

Type augmentation will be needed for `session.user.slackId` and
`token.slackId`.

## Callback / user sync flow

1. User clicks "Sign in with Hack Club" -> `signIn("hackclub")`.
2. Auth.js redirects to Hack Club Auth with OIDC scopes.
3. Hack Club Auth redirects to `/api/auth/callback/hackclub`.
4. Auth.js validates issuer, audience, signature, state, and nonce.
5. After login, server-side session helpers upsert the Payload `users` row using
   `oidc_sub` and `slack_id`.
6. Every VM route checks allowlist membership before doing work.

Keep the allowlist check outside the Auth.js provider. Login should succeed even
for denied users so the denied page can show which Slack ID was seen.

## Required env vars

```bash
AUTH_SECRET=...
AUTH_URL=https://payload.hackclub.com
HACKCLUB_OIDC_CLIENT_ID=...
HACKCLUB_OIDC_CLIENT_SECRET=...
```

Development may use `AUTH_URL=http://localhost:3000`.

## Registering the app

Register Payload at the Hack Club Auth dashboard and set redirect URI to:

```
https://payload.hackclub.com/api/auth/callback/hackclub
```

For local development, add:

```
http://localhost:3000/api/auth/callback/hackclub
```

## Security notes

- Do not persist Hack Club access or refresh tokens unless a future feature
  truly needs them.
- Use secure cookies in production; Auth.js handles this when `AUTH_URL` is HTTPS.
- The Slack-ID allowlist is authorization, not authentication. Enforce it on
  every server action and route handler that touches VM state.
