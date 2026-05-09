class CreateVmTypes < ActiveRecord::Migration[8.1]
  def change
    create_table :vm_types do |t|
      t.string :slug
      t.string :display_name
      t.integer :proxmox_template_vmid
      t.string :proxmox_node
      t.string :protocol
      t.integer :default_port
      t.boolean :enabled, null: false, default: false
      t.text :description

      t.timestamps
    end
    add_index :vm_types, :slug, unique: true
  end
end
