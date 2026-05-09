class CreateVmSessionEvents < ActiveRecord::Migration[8.1]
  def change
    create_table :vm_session_events do |t|
      t.references :vm_session, null: false, foreign_key: true
      t.string :kind
      t.jsonb :payload

      t.timestamps
    end
  end
end
