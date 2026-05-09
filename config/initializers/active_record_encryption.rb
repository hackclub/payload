# Active Record encryption keys.
#
# Production / staging MUST supply these via environment variables (or
# credentials). Development and test fall back to fixed dev-only keys so the
# app boots out of the box. NEVER copy these dev keys into production.

dev_defaults = {
  primary_key:         "T5Leuoyh8hdl13EiOC4IjUBhXQHFHl6F",
  deterministic_key:   "eH8KHwawV1dGpV0eNBxuVSjZmsw166BM",
  key_derivation_salt: "9TdQOhPaSMbVBuWvYwr0zucMfIJc0p74"
}

primary    = ENV["AR_ENCRYPTION_PRIMARY_KEY"]
det        = ENV["AR_ENCRYPTION_DETERMINISTIC_KEY"]
salt       = ENV["AR_ENCRYPTION_KEY_DERIVATION_SALT"]

if Rails.env.development? || Rails.env.test?
  primary ||= dev_defaults[:primary_key]
  det     ||= dev_defaults[:deterministic_key]
  salt    ||= dev_defaults[:key_derivation_salt]
end

Rails.application.config.active_record.encryption.primary_key            = primary if primary
Rails.application.config.active_record.encryption.deterministic_key      = det if det
Rails.application.config.active_record.encryption.key_derivation_salt    = salt if salt

if defined?(ActiveRecord::Encryption)
  ActiveRecord::Encryption.config.primary_key = primary if primary
  ActiveRecord::Encryption.config.deterministic_key = det if det
  ActiveRecord::Encryption.config.key_derivation_salt = salt if salt
end
