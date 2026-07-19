provider "aws" {
  profile = "claude-spawn"
  region  = "us-east-1"

  default_tags {
    tags = {
      Project   = "spawn"
      ManagedBy = "terraform"
      Repo      = "claude-spawn"
    }
  }
}

data "aws_caller_identity" "current" {}

data "aws_vpc" "default" {
  default = true
}

# A subnet in a standard AZ (us-east-1a) — us-east-1 has some "extra" AZs
# (e.g. us-east-1e) that don't support every instance type, including
# t3.micro, so we pin to one that reliably does rather than taking whatever
# the default-VPC subnet list happens to return first.
data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
  filter {
    name   = "default-for-az"
    values = ["true"]
  }
  filter {
    name   = "availability-zone"
    values = ["us-east-1a"]
  }
}
