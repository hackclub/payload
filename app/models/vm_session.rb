class VmSession < ApplicationRecord
  belongs_to :user
  belongs_to :vm_type
  has_many :events, class_name: "VmSessionEvent", dependent: :destroy

  STATES = %w[pending provisioning ready active terminating terminated errored].freeze
  ALIVE_STATES = %w[pending provisioning ready active].freeze
  TERMINATION_REASONS = %w[idle ttl user error admin].freeze

  enum :state, STATES.zip(STATES).to_h, validate: true

  encrypts :vm_credential

  validates :expires_at, presence: true
  validates :termination_reason, inclusion: { in: TERMINATION_REASONS }, allow_nil: true

  scope :alive, -> { where(state: ALIVE_STATES) }

  # The deadline at which the session will be killed: whichever comes first
  # between the hard 6h TTL and the idle deadline (if active).
  IDLE_LIMIT = 30.minutes

  def deadline_at
    candidates = [ expires_at ]
    candidates << (last_heartbeat_at + IDLE_LIMIT) if active? && last_heartbeat_at
    candidates.compact.min
  end

  def alive?
    ALIVE_STATES.include?(state)
  end
end
