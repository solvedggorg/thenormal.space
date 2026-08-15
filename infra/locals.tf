locals {
  workers = {
    site = {
      name     = "thenormal-space"
      hostname = var.zone_name
    }
    api = {
      name     = "thenormal-space-api"
      hostname = "api.${var.zone_name}"
    }
    auth = {
      name     = "thenormal-auth"
      hostname = "auth.${var.zone_name}"
    }
    auth_admin = {
      name     = "thenormal-auth-admin"
      hostname = "admin2.${var.zone_name}"
    }
    stats = {
      name     = "thenormal-stats"
      hostname = "stats.${var.zone_name}"
    }
    stats_tail = {
      name     = "thenormal-stats-tail"
      hostname = null
    }
    shop = {
      name     = "thenormal-shop"
      hostname = "shop.${var.zone_name}"
    }
    shop_backend = {
      name     = "thenormal-shop-backend"
      hostname = "admin1.${var.zone_name}"
    }
  }

  d1_names = {
    auth = "thenormal-auth"
    list = "thenormal-list"
    shop = "thenormal-shop"
  }

  kv_titles = {
    auth  = "thenormal-auth"
    shop  = "thenormal-shop-cache"
    stats = "thenormal-stats"
  }

  r2_media_bucket = "thenormal-shop-media"
  r2_media_host   = "media.${var.zone_name}"
  queue_name      = "thenormal-shop-events"
  hyperdrive_name = "thenormal-shop"
}
