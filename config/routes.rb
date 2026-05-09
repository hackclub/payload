Rails.application.routes.draw do
  root "dashboard#show"

  get "up" => "rails/health#show", as: :rails_health_check

  get "sign_in", to: "sessions#new"
  match "auth/:provider/callback", to: "sessions#create", via: %i[get post]
  get "auth/failure", to: "sessions#failure"
  delete "sign_out", to: "sessions#destroy"

  resources :vm_sessions, path: "sessions", only: %i[create show destroy] do
    post :heartbeat, on: :member
  end
end
