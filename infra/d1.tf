resource "cloudflare_d1_database" "this" {
  for_each              = local.d1_names
  account_id            = var.account_id
  name                  = each.value
  primary_location_hint = "wnam"
  read_replication = {
    mode = "disabled"
  }
}
