# Seeds reference data. Idempotent: safe to run on every deploy.

require "yaml"

# --- VM types ----------------------------------------------------------------
vm_types_file = Rails.root.join("db/seeds/vm_types.yml")
YAML.load_file(vm_types_file).each do |row|
  vt = VmType.find_or_initialize_by(slug: row.fetch("slug"))
  vt.assign_attributes(
    display_name:          row.fetch("display_name"),
    proxmox_template_vmid: row.fetch("proxmox_template_vmid"),
    proxmox_node:          row.fetch("proxmox_node"),
    protocol:              row.fetch("protocol"),
    default_port:          row.fetch("default_port"),
    enabled:               row.fetch("enabled"),
    description:           row.fetch("description")
  )
  vt.save!
end
puts "Seeded #{VmType.count} vm_types (#{VmType.available.count} enabled)."

# --- Reviewer allowlist ------------------------------------------------------
reviewers_file = Rails.root.join("config/reviewers.yml")
if File.exist?(reviewers_file)
  YAML.load_file(reviewers_file).each do |row|
    entry = ReviewerAllowlistEntry.find_or_initialize_by(slack_id: row.fetch("slack_id"))
    entry.assign_attributes(
      note:     row["note"],
      added_by: row["added_by"]
    )
    entry.save!
  end
  puts "Seeded #{ReviewerAllowlistEntry.count} reviewer_allowlist_entries."
else
  warn "config/reviewers.yml not found; allowlist not seeded."
end
