// VPS control endpoint — lets anyone holding the shared token turn the Windows
// VPS on/off WITHOUT any AWS credentials. Runs as a Lambda behind a Function
// URL; its IAM role (no static keys) is scoped to exactly: start/stop/describe
// the one tagged instance, and open/close RDP on the one security group.
//
// Power-only by design: it never touches the Windows admin password (Marc
// shares that out of band). On start it opens RDP scoped to the *caller's*
// IP only. On stop it closes RDP for everyone and stops the box.
import { timingSafeEqual } from "node:crypto";
import {
  EC2Client,
  DescribeInstancesCommand,
  StartInstancesCommand,
  StopInstancesCommand,
  DescribeSecurityGroupsCommand,
  AuthorizeSecurityGroupIngressCommand,
  RevokeSecurityGroupIngressCommand,
} from "@aws-sdk/client-ec2";

const ec2 = new EC2Client({});
const NAME_TAG = process.env.VPS_NAME_TAG || "spawn-windows-vps";
const SG_ID = process.env.VPS_SG_ID;
const TOKEN = process.env.VPS_CONTROL_TOKEN || "";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const json = (statusCode, obj) => ({
  statusCode,
  headers: { "content-type": "application/json" },
  body: JSON.stringify(obj),
});

function tokenOk(headers, query) {
  const auth = headers?.authorization || headers?.Authorization || "";
  const bearer = auth.replace(/^Bearer\s+/i, "");
  const provided = bearer || query?.token || "";
  if (!TOKEN || !provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function findInstance() {
  const di = await ec2.send(
    new DescribeInstancesCommand({
      Filters: [
        { Name: "tag:Name", Values: [NAME_TAG] },
        { Name: "instance-state-name", Values: ["pending", "running", "stopping", "stopped", "stopped"] },
      ],
    })
  );
  return di.Reservations?.[0]?.Instances?.[0] ?? null;
}

export const handler = async (event) => {
  const headers = event.headers || {};
  const query = event.queryStringParameters || {};
  const method = event.requestContext?.http?.method || "GET";
  const sourceIp = event.requestContext?.http?.sourceIp;

  if (!tokenOk(headers, query)) return json(401, { error: "unauthorized" });

  // action from ?action= or the last path segment (/start, /stop, /status)
  const path = (event.requestContext?.http?.path || event.rawPath || "").replace(/\/+$/, "");
  const action = (query.action || path.split("/").pop() || "").toLowerCase();

  try {
    const inst = await findInstance();
    if (!inst) return json(404, { error: `no instance tagged Name=${NAME_TAG}` });
    const id = inst.InstanceId;

    if (action === "status") {
      return json(200, { ok: true, action, instanceId: id, state: inst.State?.Name, publicIp: inst.PublicIpAddress ?? null });
    }

    if (action === "start" || action === "on") {
      if (method === "GET") return json(405, { error: "use POST to start" });
      await ec2.send(new StartInstancesCommand({ InstanceIds: [id] }));
      if (sourceIp) {
        try {
          await ec2.send(
            new AuthorizeSecurityGroupIngressCommand({
              GroupId: SG_ID,
              IpPermissions: [
                { IpProtocol: "tcp", FromPort: 3389, ToPort: 3389, IpRanges: [{ CidrIp: `${sourceIp}/32`, Description: "vpsctl" }] },
              ],
            })
          );
        } catch (e) {
          if (!/Duplicate/i.test(`${e.name} ${e.message}`)) throw e;
        }
      }
      // Wait briefly for the public IP (only assigned once running).
      let ip = null;
      for (let i = 0; i < 8; i++) {
        const d = await ec2.send(new DescribeInstancesCommand({ InstanceIds: [id] }));
        const x = d.Reservations?.[0]?.Instances?.[0];
        if (x?.State?.Name === "running" && x?.PublicIpAddress) {
          ip = x.PublicIpAddress;
          break;
        }
        await sleep(2500);
      }
      return json(200, {
        ok: true,
        action: "start",
        instanceId: id,
        state: ip ? "running" : "starting",
        publicIp: ip,
        rdpScopedTo: sourceIp ? `${sourceIp}/32` : null,
        note: ip
          ? `RDP to ${ip}:3389 (username Administrator). Get the password from Marc.`
          : "Still booting — call status in ~30s for the IP.",
      });
    }

    if (action === "stop" || action === "off") {
      if (method === "GET") return json(405, { error: "use POST to stop" });
      // Close RDP for everyone (the box is going down anyway).
      const sg = await ec2.send(new DescribeSecurityGroupsCommand({ GroupIds: [SG_ID] }));
      const perms = (sg.SecurityGroups?.[0]?.IpPermissions || []).filter((p) => p.FromPort === 3389 && p.ToPort === 3389);
      if (perms.length) await ec2.send(new RevokeSecurityGroupIngressCommand({ GroupId: SG_ID, IpPermissions: perms }));
      await ec2.send(new StopInstancesCommand({ InstanceIds: [id] }));
      return json(200, { ok: true, action: "stop", instanceId: id, state: "stopping" });
    }

    return json(400, { error: "unknown action — use start, stop, or status" });
  } catch (e) {
    return json(500, { error: e.message });
  }
};
