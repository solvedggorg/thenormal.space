terraform {
  required_version = ">= 1.5.0"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.21"
    }
  }

  # State lives in R2 bucket thenormal-tfstate (created outside this stack).
  # Auth: AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY = R2 API token pair.
  backend "s3" {
    bucket                      = "thenormal-tfstate"
    key                         = "thenormal.space/terraform.tfstate"
    region                      = "auto"
    skip_credentials_validation = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_metadata_api_check     = true
    skip_s3_checksum            = true
    use_path_style              = true
    endpoints = {
      s3 = "https://97b0dab10c55d2e8a6c952eb4e4914ac.r2.cloudflarestorage.com"
    }
  }
}

provider "cloudflare" {}
