resource "cloudflare_r2_bucket" "analytics" {
  account_id    = var.account_id
  name          = local.r2_analytics_bucket
  location      = "wnam"
  storage_class = "Standard"
}

resource "cloudflare_r2_bucket" "media" {
  account_id    = var.account_id
  name          = local.r2_media_bucket
  location      = "wnam"
  storage_class = "Standard"
}

resource "cloudflare_r2_custom_domain" "media" {
  count       = var.manage_r2_custom_domain ? 1 : 0
  account_id  = var.account_id
  bucket_name = cloudflare_r2_bucket.media.name
  domain      = local.r2_media_host
  enabled     = true
  zone_id     = var.zone_id
  min_tls     = "1.2"
}
