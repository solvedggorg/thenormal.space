resource "cloudflare_zero_trust_access_application" "auth_admin" {
  count            = var.manage_access ? 1 : 0
  account_id       = var.account_id
  name             = "thenormal-auth-admin"
  domain           = local.workers.auth_admin.hostname
  type             = "self_hosted"
  session_duration = "24h"
  allowed_idps     = [var.access_idp_id]

  policies = [{
    name       = "Cloudflare account members"
    decision   = "allow"
    precedence = 1
    include = [{
      login_method = {
        id = var.access_idp_id
      }
    }]
  }]
}

resource "cloudflare_zero_trust_access_application" "shop_admin" {
  count            = var.manage_access ? 1 : 0
  account_id       = var.account_id
  name             = "thenormal-shop-admin"
  domain           = "${local.workers.shop_backend.hostname}/app"
  type             = "self_hosted"
  session_duration = "24h"
  allowed_idps     = [var.access_idp_id]

  policies = [{
    name       = "Cloudflare account members"
    decision   = "allow"
    precedence = 1
    include = [{
      login_method = {
        id = var.access_idp_id
      }
    }]
  }]
}
