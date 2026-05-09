class VmType < ApplicationRecord
  has_many :vm_sessions, dependent: :restrict_with_exception

  validates :slug, presence: true, uniqueness: true
  validates :display_name, presence: true
  validates :protocol, inclusion: { in: %w[vnc rdp] }

  scope :available, -> { where(enabled: true) }
  scope :ordered, -> { order(:display_name) }

  # UI tint per OS slug, mapped to design-system.md.
  def tint_class
    case slug
    when "linux"   then "text-hc-orange"
    when "windows" then "text-hc-cyan"
    when "android" then "text-hc-green"
    when "macos"   then "text-hc-slate"
    else                "text-hc-muted"
    end
  end

  def icon_name
    case slug
    when "linux"   then "linux"
    when "windows" then "windows"
    when "android" then "android"
    when "macos"   then "apple"
    else                "monitor"
    end
  end
end
