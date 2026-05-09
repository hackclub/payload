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

- `openid` → `sub` (e.g. `ident!abc123`) — required
- `profile` → `name`, `given_name`, `family_name`, `nickname`
- `email` → `email`, `email_verified`
- `slack_id` → `slack_id` (e.g. `U0123ABC`) — **key claim for allowlist**

Community-app scope ceiling is `openid profile email name slack_id verification_status`.
We're within that.

## Avatar / picture

Hack Club Auth does NOT return a `picture` claim. To get the user's PFP:

```
https://cachet.dunkirk.sh/users/{slack_id}/r
```

The `/r` suffix returns a redirect to the actual image.

## Rails wiring (omniauth-openid_connect)

```ruby
# config/initializers/omniauth.rb
Rails.application.config.middleware.use OmniAuth::Builder do
  provider :openid_connect, {
    name: :hackclub,
    discovery: true,
    scope: %w[openid profile email slack_id],
    response_type: :code,
    issuer: "https://auth.hackclub.com",
    client_options: {
      identifier:   ENV.fetch("HACKCLUB_OIDC_CLIENT_ID"),
      secret:       ENV.fetch("HACKCLUB_OIDC_CLIENT_SECRET"),
      redirect_uri: ENV.fetch("HACKCLUB_OIDC_REDIRECT_URI"),
      host:         "auth.hackclub.com",
      scheme:       "https"
    }
  }
end
```

## Callback flow

1. User clicks "Sign in with Hack Club" → redirect to `/auth/hackclub`.
2. User logs in, approves scopes.
3. Hack Club Auth redirects back with code.
4. Our `SessionsController#create`:
   ```ruby
   info  = request.env["omniauth.auth"].info
   raw   = request.env["omniauth.auth"].extra.raw_info
   sub   = request.env["omniauth.auth"].uid
   slack = raw["slack_id"]

   if slack.blank?
     redirect_to root_path, alert: "Slack ID claim missing"
     return
   end

   user = User.find_or_initialize_by(slack_id: slack)
   user.assign_attributes(oidc_sub: sub, email: info.email, name: info.name,
                          avatar_url: "https://cachet.dunkirk.sh/users/#{slack}/r",
                          last_login_at: Time.current)
   user.save!

   unless user.reviewer?
     redirect_to root_path, alert: "Your Slack ID is not on the reviewer allowlist."
     return
   end

   session[:user_id] = user.id
   redirect_to dashboard_path
   ```

## Required env vars

```bash
HACKCLUB_OIDC_CLIENT_ID=…
HACKCLUB_OIDC_CLIENT_SECRET=…
HACKCLUB_OIDC_REDIRECT_URI=https://payload.hackclub.com/auth/hackclub/callback
```

## Registering the app

TBD: register Payload at the Hack Club Auth dashboard, set redirect URI to
production URL, save credentials to deploy secrets store.

## Security notes

- Validate `aud` and `iss` claims (omniauth-openid_connect does this when
  `discovery: true` and `issuer:` set).
- ID token is JWT-signed by Hack Club; don't skip signature validation.
- We do NOT persist access/refresh tokens — only need identity once per login.
- Sessions are Rails-encrypted cookies. Set `secure: true, same_site: :lax`.
