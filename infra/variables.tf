variable "cloudflare_api_token" {
  type        = string
  sensitive   = true
  default     = null
  description = "Account API token. Leave null to use CLOUDFLARE_API_TOKEN."
}

variable "account_id" {
  type        = string
  description = "Cloudflare account that owns thenormal.space"
  default     = "97b0dab10c55d2e8a6c952eb4e4914ac"
}

variable "zone_id" {
  type        = string
  description = "thenormal.space zone ID"
  default     = "311f1a68293f44452ef3147ec6f4ea8b"
}

variable "zone_name" {
  type    = string
  default = "thenormal.space"
}

variable "access_idp_id" {
  type        = string
  description = "Cloudflare Access identity provider used for admin apps (One-time PIN / account members)"
  default     = "31c4d1bc-8503-4969-9ac9-f435487261d6"
}

variable "access_team_domain" {
  type        = string
  description = "Zero Trust team domain used by auth-admin JWT checks"
  default     = "https://iresolved-llc.cloudflareaccess.com"
}

variable "hyperdrive_origin_host" {
  type        = string
  description = "Neon (or other Postgres) hostname for Hyperdrive"
  default     = "ep-spring-poetry-ayi2y76j.c-5.us-east-2.aws.neon.tech"
}

variable "hyperdrive_origin_database" {
  type    = string
  default = "neondb"
}

variable "hyperdrive_origin_user" {
  type    = string
  default = "neondb_owner"
}

variable "hyperdrive_origin_port" {
  type    = number
  default = 5432
}

variable "hyperdrive_origin_password" {
  type        = string
  sensitive   = true
  default     = null
  description = "Postgres password. Required to create Hyperdrive. Set TF_VAR_hyperdrive_origin_password."
}

variable "manage_hyperdrive" {
  type        = bool
  default     = true
  description = "Set false to skip Hyperdrive (e.g. first apply without the DB password)."
}

variable "manage_r2_custom_domain" {
  type        = bool
  default     = true
  description = "media.thenormal.space on the shop media bucket. Needs a token that can edit the zone."
}

variable "manage_access" {
  type        = bool
  default     = true
  description = "Zero Trust apps for admin1/admin2."
}
