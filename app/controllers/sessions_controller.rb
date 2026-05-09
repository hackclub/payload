class SessionsController < ApplicationController
  def new
    redirect_to root_path if signed_in?
  end

  def create
    auth = request.env["omniauth.auth"]

    unless auth
      redirect_to sign_in_path, alert: "Hack Club Auth did not return a login response."
      return
    end

    user = user_from_auth(auth)
    user.save!

    session[:user_id] = user.id

    if user.reviewer?
      redirect_to root_path, notice: "Signed in with Hack Club."
    else
      redirect_to root_path, alert: "Your Slack ID is not on the reviewer allowlist yet."
    end
  end

  def failure
    redirect_to sign_in_path, alert: params[:message].presence || "Hack Club sign-in was cancelled."
  end

  def destroy
    reset_session
    redirect_to sign_in_path, notice: "Signed out."
  end

  private

  def user_from_auth(auth)
    raw = auth.dig("extra", "raw_info") || {}
    info = auth["info"] || {}
    slack_id = raw["slack_id"] || auth.dig("extra", "id_info", "slack_id")

    if slack_id.blank? || auth["uid"].blank?
      raise ActionController::BadRequest, "Hack Club Auth response is missing a Slack ID or subject."
    end

    User.find_or_initialize_by(slack_id: slack_id).tap do |user|
      user.assign_attributes(
        oidc_sub: auth["uid"],
        email: info["email"],
        name: info["name"].presence || raw["name"],
        avatar_url: "https://cachet.dunkirk.sh/users/#{slack_id}/r",
        last_login_at: Time.current
      )
    end
  end
end
