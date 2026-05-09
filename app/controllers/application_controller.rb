class ApplicationController < ActionController::Base
  allow_browser versions: :modern

  stale_when_importmap_changes

  helper_method :current_user, :signed_in?, :oidc_configured?

  private

  def current_user
    @current_user ||= User.find_by(id: session[:user_id]) if session[:user_id]
  end

  def signed_in?
    current_user.present?
  end

  def oidc_configured?
    Rails.configuration.x.oidc_configured
  end

  def authenticate_user!
    redirect_to sign_in_path unless signed_in?
  end

  def require_reviewer!
    return if current_user&.reviewer?

    render "sessions/denied", status: :forbidden
  end
end
