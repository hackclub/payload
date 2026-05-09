class DashboardController < ApplicationController
  before_action :authenticate_user!
  before_action :require_reviewer!

  def show
    @active_sessions = current_user.vm_sessions.includes(:vm_type).alive.order(created_at: :desc)
    @recent_sessions = current_user.vm_sessions.includes(:vm_type).where.not(state: VmSession::ALIVE_STATES).order(updated_at: :desc).limit(3)
    @vm_types = VmType.ordered
  end
end
