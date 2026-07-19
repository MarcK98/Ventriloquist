terraform {
  required_version = ">= 1.5"

  # Only aws + archive are used — deliberately no random/tls/local providers,
  # so this works from a network that can only reach a local filesystem
  # mirror of providers (see .terraformrc / TF_CLI_CONFIG_FILE). Secrets and
  # the VPS RSA keypair are generated once by scripts/bootstrap-secrets.sh
  # (plain openssl/ssh-keygen) instead.
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.7"
    }
  }

  # Local state for now (terraform.tfstate, gitignored). Fine for solo use on
  # one machine. See README.md "Remote backend (optional upgrade)" for the
  # S3+DynamoDB path if this ever needs multi-machine/team access.
}
