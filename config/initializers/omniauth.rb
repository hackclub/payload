Rails.application.config.x.oidc_configured =
  ENV["HACKCLUB_OIDC_CLIENT_ID"].present? &&
  ENV["HACKCLUB_OIDC_CLIENT_SECRET"].present? &&
  ENV["HACKCLUB_OIDC_REDIRECT_URI"].present?

OmniAuth.config.allowed_request_methods = %i[post]
OmniAuth.config.silence_get_warning = true

if Rails.application.config.x.oidc_configured
  Rails.application.config.middleware.use OmniAuth::Builder do
    provider :openid_connect, {
      name: :hackclub,
      discovery: true,
      scope: %i[openid profile email slack_id],
      response_type: :code,
      issuer: "https://auth.hackclub.com",
      client_options: {
        identifier: ENV.fetch("HACKCLUB_OIDC_CLIENT_ID"),
        secret: ENV.fetch("HACKCLUB_OIDC_CLIENT_SECRET"),
        redirect_uri: ENV.fetch("HACKCLUB_OIDC_REDIRECT_URI"),
        host: "auth.hackclub.com",
        scheme: "https"
      }
    }
  end
end
