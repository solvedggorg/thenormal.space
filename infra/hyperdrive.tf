resource "cloudflare_hyperdrive_config" "shop" {
  count      = var.manage_hyperdrive ? 1 : 0
  account_id = var.account_id
  name       = local.hyperdrive_name

  origin = {
    database = var.hyperdrive_origin_database
    host     = var.hyperdrive_origin_host
    port     = var.hyperdrive_origin_port
    scheme   = "postgres"
    user     = var.hyperdrive_origin_user
    password = var.hyperdrive_origin_password
  }

  caching = {
    disabled = true
  }

  origin_connection_limit = 60

  lifecycle {
    # API never returns the password. Ignore so plans without TF_VAR still refresh.
    ignore_changes = [origin]
  }
}
