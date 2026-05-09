class VmSessionsController < ApplicationController
  before_action :authenticate_user!
  before_action :require_reviewer!
  before_action :set_vm_session, only: %i[show destroy heartbeat]

  def create
    vm_type = VmType.available.find(params[:vm_type_id])

    if current_user.active_session_count >= 2
      redirect_to root_path, alert: "You already have 2 active VMs. Destroy one before spawning a new one."
      return
    end

    vm_session = current_user.vm_sessions.create!(
      vm_type: vm_type,
      state: "pending",
      expires_at: 6.hours.from_now
    )
    vm_session.events.create!(kind: "created", payload: { vm_type: vm_type.slug })

    redirect_to vm_session_path(vm_session), notice: "Your #{vm_type.display_name} VM is queued."
  end

  def show
  end

  def destroy
    @vm_session.update!(
      state: "terminated",
      terminated_at: Time.current,
      termination_reason: "user"
    )
    @vm_session.events.create!(kind: "destroyed", payload: { by: "user" })

    redirect_to root_path, notice: "VM destroyed."
  end

  def heartbeat
    @vm_session.update!(last_heartbeat_at: Time.current)
    head :no_content
  end

  private

  def set_vm_session
    @vm_session = current_user.vm_sessions.includes(:vm_type).find(params[:id])
  end
end
