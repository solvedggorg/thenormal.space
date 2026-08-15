resource "cloudflare_workers_kv_namespace" "this" {
  for_each   = local.kv_titles
  account_id = var.account_id
  title      = each.value
}
