class User < ApplicationRecord
  has_many :vm_sessions, dependent: :restrict_with_exception

  validates :slack_id, presence: true, uniqueness: true
  validates :oidc_sub, presence: true, uniqueness: true

  ALIVE_STATES = %w[pending provisioning ready active].freeze

  def reviewer?
    ReviewerAllowlistEntry.exists?(slack_id: slack_id)
  end

  def active_session_count
    vm_sessions.where(state: ALIVE_STATES).count
  end

  def display_name
    name.presence || email.presence || slack_id
  end
end
