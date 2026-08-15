output "account_id" {
  value = var.account_id
}

output "zone_id" {
  value = var.zone_id
}

output "workers" {
  value = { for k, v in local.workers : k => v.name }
}

output "d1" {
  value = { for k, db in cloudflare_d1_database.this : k => { name = db.name, id = db.id } }
}

output "kv" {
  value = { for k, ns in cloudflare_workers_kv_namespace.this : k => { title = ns.title, id = ns.id } }
}

output "r2_media_bucket" {
  value = cloudflare_r2_bucket.media.name
}

output "queue_name" {
  value = cloudflare_queue.shop_events.queue_name
}

output "queue_id" {
  value = cloudflare_queue.shop_events.id
}

output "hyperdrive_id" {
  value = try(cloudflare_hyperdrive_config.shop[0].id, null)
}

output "access_auth_admin_aud" {
  value = try(cloudflare_zero_trust_access_application.auth_admin[0].aud, null)
}

output "access_shop_admin_aud" {
  value = try(cloudflare_zero_trust_access_application.shop_admin[0].aud, null)
}

output "access_team_domain" {
  value = var.access_team_domain
}

# Shape consumed by scripts/apply-terraform-bindings.mjs
output "wrangler_bindings" {
  value = {
    account_id    = var.account_id
    zone_id       = var.zone_id
    d1_auth_id    = cloudflare_d1_database.this["auth"].id
    d1_list_id    = cloudflare_d1_database.this["list"].id
    d1_shop_id    = cloudflare_d1_database.this["shop"].id
    kv_auth_id    = cloudflare_workers_kv_namespace.this["auth"].id
    kv_shop_id    = cloudflare_workers_kv_namespace.this["shop"].id
    kv_stats_id   = cloudflare_workers_kv_namespace.this["stats"].id
    r2_media      = cloudflare_r2_bucket.media.name
    queue_name    = cloudflare_queue.shop_events.queue_name
    hyperdrive_id = try(cloudflare_hyperdrive_config.shop[0].id, "")
    policy_aud    = try(cloudflare_zero_trust_access_application.auth_admin[0].aud, "")
    team_domain   = var.access_team_domain
  }
}
