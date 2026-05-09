class CreateVmSessions < ActiveRecord::Migration[8.1]
  def change
    create_table :vm_sessions do |t|
      t.references :user, null: false, foreign_key: true
      t.references :vm_type, null: false, foreign_key: true
      t.string :state, null: false, default: "pending"
      t.integer :proxmox_vmid
      t.string :proxmox_node
      t.inet :vm_ip
      t.string :vm_credential
      t.string :guacamole_connection_id
      t.string :guacamole_username
      t.datetime :expires_at, null: false
      t.datetime :last_heartbeat_at
      t.datetime :terminated_at
      t.string :termination_reason

      t.timestamps
    end

    add_index :vm_sessions, [ :user_id, :state ]
    add_index :vm_sessions, [ :state, :expires_at ]
    add_index :vm_sessions, [ :state, :last_heartbeat_at ]
  end
end
