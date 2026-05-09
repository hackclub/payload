class VmSessionEvent < ApplicationRecord
  belongs_to :vm_session

  KINDS = %w[
    created
    clone_started
    ip_acquired
    guacamole_registered
    heartbeat
    terminated
    error
  ].freeze

  validates :kind, inclusion: { in: KINDS }
end
