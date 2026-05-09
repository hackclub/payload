class CreateReviewerAllowlistEntries < ActiveRecord::Migration[8.1]
  def change
    create_table :reviewer_allowlist_entries do |t|
      t.string :slack_id
      t.string :note
      t.string :added_by

      t.timestamps
    end
    add_index :reviewer_allowlist_entries, :slack_id, unique: true
  end
end
