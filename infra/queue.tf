resource "cloudflare_queue" "shop_events" {
  account_id = var.account_id
  queue_name = local.queue_name
}
