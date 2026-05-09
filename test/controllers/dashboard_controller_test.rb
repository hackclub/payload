require "test_helper"

class DashboardControllerTest < ActionDispatch::IntegrationTest
  setup do
    @user = User.create!(
      slack_id: "U123REVIEW",
      oidc_sub: "ident!review",
      name: "Reviewer"
    )
    ReviewerAllowlistEntry.create!(slack_id: @user.slack_id)
    @linux = VmType.create!(
      slug: "linux",
      display_name: "Linux",
      proxmox_template_vmid: 9001,
      proxmox_node: "pve-1",
      protocol: "vnc",
      default_port: 5900,
      enabled: true,
      description: "Ubuntu desktop for project review."
    )
  end

  test "redirects anonymous users to sign in" do
    get root_path

    assert_redirected_to sign_in_path
  end

  test "renders dashboard for allowlisted reviewer" do
    sign_in_as(@user)

    get root_path

    assert_response :success
    assert_select "h1", /Choose a clean desktop/
    assert_select "article.vm-card", text: /Linux/
  end

  test "spawns pending session from enabled vm type" do
    sign_in_as(@user)

    assert_difference -> { @user.vm_sessions.count }, 1 do
      post vm_sessions_path(vm_type_id: @linux.id)
    end

    session = @user.vm_sessions.last
    assert_equal "pending", session.state
    assert_redirected_to vm_session_path(session)
  end

  private

  def sign_in_as(user)
    post auth_path_for_test, params: {}, env: {
      "omniauth.auth" => {
        "uid" => user.oidc_sub,
        "info" => { "name" => user.name },
        "extra" => { "raw_info" => { "slack_id" => user.slack_id } }
      }
    }
  end

  def auth_path_for_test
    "/auth/hackclub/callback"
  end
end
