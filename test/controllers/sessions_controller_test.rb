require "test_helper"

class SessionsControllerTest < ActionDispatch::IntegrationTest
  test "renders sign in when oidc is not configured" do
    get sign_in_path

    assert_response :success
    assert_select "button[disabled]", /Hack Club sign-in unavailable/
  end

  test "creates user from hack club auth and marks deny path for non-reviewer" do
    post "/auth/hackclub/callback", env: {
      "omniauth.auth" => {
        "uid" => "ident!new",
        "info" => { "email" => "new@example.com", "name" => "New Reviewer" },
        "extra" => { "raw_info" => { "slack_id" => "UNEW123" } }
      }
    }

    assert_redirected_to root_path
    assert User.exists?(slack_id: "UNEW123", oidc_sub: "ident!new")
  end
end
