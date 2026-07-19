# VPS on/off control endpoint — so anyone with the repo (+ the shared token
# Marc hands out) can start/stop the Windows VPS WITHOUT any AWS credentials.
# A Lambda behind a Function URL holds the AWS access via its IAM role (no
# static keys); repo users just curl it (see vpsctl.sh). Power-only: it never
# handles the Windows password.

data "archive_file" "vps_control" {
  type        = "zip"
  source_dir  = "${path.module}/lambda/vps-control"
  output_path = "${path.module}/.build/vps-control.zip"
}

# ── IAM role (least privilege, scoped to just this VPS + its SG) ─────────────
data "aws_iam_policy_document" "vps_control_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "vps_control" {
  name               = "spawn-vps-control-role"
  assume_role_policy = data.aws_iam_policy_document.vps_control_assume.json
}

resource "aws_iam_role_policy_attachment" "vps_control_logs" {
  role       = aws_iam_role.vps_control.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_iam_policy_document" "vps_control_inline" {
  # Start/stop limited to instances tagged Name=spawn-windows-vps — survives
  # the archive/restore cycle (which changes the instance id) via the tag,
  # and can't touch any other instance.
  statement {
    sid       = "StartStopTaggedVps"
    actions   = ["ec2:StartInstances", "ec2:StopInstances"]
    resources = ["*"]
    condition {
      test     = "StringEquals"
      variable = "ec2:ResourceTag/Name"
      values   = ["spawn-windows-vps"]
    }
  }
  # Describe calls don't support resource-level scoping — read-only, low risk.
  statement {
    sid       = "DescribeForControl"
    actions   = ["ec2:DescribeInstances", "ec2:DescribeSecurityGroups"]
    resources = ["*"]
  }
  # RDP open/close only on the VPS's own security group.
  statement {
    sid     = "ManageVpsRdpRule"
    actions = ["ec2:AuthorizeSecurityGroupIngress", "ec2:RevokeSecurityGroupIngress"]
    resources = [
      "arn:aws:ec2:us-east-1:${data.aws_caller_identity.current.account_id}:security-group/${aws_security_group.vps.id}",
    ]
  }
}

resource "aws_iam_role_policy" "vps_control_inline" {
  name   = "spawn-vps-control-inline"
  role   = aws_iam_role.vps_control.id
  policy = data.aws_iam_policy_document.vps_control_inline.json
}

# ── Lambda + public Function URL (auth is the bearer token, checked in code) ─
resource "aws_lambda_function" "vps_control" {
  function_name    = "spawn-vps-control"
  role             = aws_iam_role.vps_control.arn
  runtime          = "nodejs20.x"
  handler          = "index.handler"
  filename         = data.archive_file.vps_control.output_path
  source_code_hash = data.archive_file.vps_control.output_base64sha256
  timeout          = 30

  environment {
    variables = {
      VPS_NAME_TAG      = "spawn-windows-vps"
      VPS_SG_ID         = aws_security_group.vps.id
      VPS_CONTROL_TOKEN = var.vps_control_token
    }
  }
}

# Public entry point via API Gateway HTTP API rather than a Lambda Function
# URL: this account's Organization SCPs block public (auth-NONE) Lambda
# Function URLs, but allow a public HTTP API. Auth is still the bearer token
# checked inside the Lambda; API Gateway just forwards (payload format 2.0,
# same event shape the handler already reads — incl. requestContext.http.sourceIp).
resource "aws_apigatewayv2_api" "vps_control" {
  name          = "spawn-vps-control"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_integration" "vps_control" {
  api_id                 = aws_apigatewayv2_api.vps_control.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.vps_control.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "vps_control" {
  api_id    = aws_apigatewayv2_api.vps_control.id
  route_key = "$default"
  target    = "integrations/${aws_apigatewayv2_integration.vps_control.id}"
}

resource "aws_apigatewayv2_stage" "vps_control" {
  api_id      = aws_apigatewayv2_api.vps_control.id
  name        = "$default"
  auto_deploy = true
}

resource "aws_lambda_permission" "vps_control_apigw" {
  statement_id  = "AllowApiGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.vps_control.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.vps_control.execution_arn}/*/*"
}

output "vps_control_url" {
  description = "Endpoint repo users hit (with the shared token) to start/stop the VPS."
  value       = aws_apigatewayv2_stage.vps_control.invoke_url
}
