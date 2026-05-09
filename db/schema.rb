# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_05_09_043729) do
  # These are extensions that must be enabled in order to support this database
  enable_extension "pg_catalog.plpgsql"

  create_table "reviewer_allowlist_entries", force: :cascade do |t|
    t.string "added_by"
    t.datetime "created_at", null: false
    t.string "note"
    t.string "slack_id"
    t.datetime "updated_at", null: false
    t.index ["slack_id"], name: "index_reviewer_allowlist_entries_on_slack_id", unique: true
  end

  create_table "users", force: :cascade do |t|
    t.string "avatar_url"
    t.datetime "created_at", null: false
    t.string "email"
    t.datetime "last_login_at"
    t.string "name"
    t.string "oidc_sub", null: false
    t.string "slack_id", null: false
    t.datetime "updated_at", null: false
    t.index ["oidc_sub"], name: "index_users_on_oidc_sub", unique: true
    t.index ["slack_id"], name: "index_users_on_slack_id", unique: true
  end

  create_table "vm_session_events", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "kind"
    t.jsonb "payload"
    t.datetime "updated_at", null: false
    t.bigint "vm_session_id", null: false
    t.index ["vm_session_id"], name: "index_vm_session_events_on_vm_session_id"
  end

  create_table "vm_sessions", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.datetime "expires_at", null: false
    t.string "guacamole_connection_id"
    t.string "guacamole_username"
    t.datetime "last_heartbeat_at"
    t.string "proxmox_node"
    t.integer "proxmox_vmid"
    t.string "state", default: "pending", null: false
    t.datetime "terminated_at"
    t.string "termination_reason"
    t.datetime "updated_at", null: false
    t.bigint "user_id", null: false
    t.string "vm_credential"
    t.inet "vm_ip"
    t.bigint "vm_type_id", null: false
    t.index ["state", "expires_at"], name: "index_vm_sessions_on_state_and_expires_at"
    t.index ["state", "last_heartbeat_at"], name: "index_vm_sessions_on_state_and_last_heartbeat_at"
    t.index ["user_id", "state"], name: "index_vm_sessions_on_user_id_and_state"
    t.index ["user_id"], name: "index_vm_sessions_on_user_id"
    t.index ["vm_type_id"], name: "index_vm_sessions_on_vm_type_id"
  end

  create_table "vm_types", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.integer "default_port"
    t.text "description"
    t.string "display_name"
    t.boolean "enabled", default: false, null: false
    t.string "protocol"
    t.string "proxmox_node"
    t.integer "proxmox_template_vmid"
    t.string "slug"
    t.datetime "updated_at", null: false
    t.index ["slug"], name: "index_vm_types_on_slug", unique: true
  end

  add_foreign_key "vm_session_events", "vm_sessions"
  add_foreign_key "vm_sessions", "users"
  add_foreign_key "vm_sessions", "vm_types"
end
