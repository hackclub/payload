class CreateUsers < ActiveRecord::Migration[8.1]
  def change
    create_table :users do |t|
      t.string :slack_id, null: false
      t.string :oidc_sub, null: false
      t.string :email
      t.string :name
      t.string :avatar_url
      t.datetime :last_login_at

      t.timestamps
    end
    add_index :users, :slack_id, unique: true
    add_index :users, :oidc_sub, unique: true
  end
end
