resource "cloudflare_queue" "shop_events" {
  account_id = var.account_id
  queue_name = local.queue_name
}

resource "cloudflare_queue" "analytics_events" {
  account_id = var.account_id
  queue_name = local.analytics_queue_name
}
