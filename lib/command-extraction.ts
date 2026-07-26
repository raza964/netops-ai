import { createHash } from "node:crypto";
import { slugify } from "./slug";
import type { RiskLevel } from "@prisma/client";

export type ExtractedCommand = {
  commandText: string;
  title: string;
  description: string;
  purpose: string;
  vendor: { name: string; slug: string };
  deviceType: string | null;
  technology: { name: string; slug: string };
  riskLevel: RiskLevel;
  isConfigChange: boolean;
};

type VendorRule = {
  name: string;
  slug: string;
  pattern: RegExp;
  deviceType: (text: string) => string | null;
};

const VENDOR_RULES: VendorRule[] = [
  {
    name: "Juniper",
    slug: "juniper",
    pattern: /\b(juniper|junos|srx|mx\d|ex\d|qfx|set protocols|show configuration)\b/i,
    deviceType: (text) =>
      /\bsrx\b/i.test(text) ? "SRX Series (Firewall)" : /\bex\d|\bqfx\b/i.test(text) ? "EX/QFX Series (Switch)" : "MX Series (Router)",
  },
  {
    name: "MikroTik",
    slug: "mikrotik",
    pattern: /\b(mikrotik|routeros|routerboard|\/ip |\/interface |\/routing |\/ppp |winbox)\b/i,
    deviceType: (text) => (/\bcrs\b/i.test(text) ? "CRS (Switch)" : /\bccr\b/i.test(text) ? "CCR (Cloud Core Router)" : "RouterOS Device"),
  },
  {
    name: "Huawei",
    slug: "huawei",
    pattern: /\b(huawei|vrp|display current-configuration|display bgp|undo shutdown|system-view|ma56|ma58)\b/i,
    deviceType: (text) => (/\bolt|ma56|ma58/i.test(text) ? "OLT" : /\bs\d{4}\b/i.test(text) ? "S Series (Switch)" : "NE/AR Series (Router)"),
  },
  {
    name: "Fortinet",
    slug: "fortinet",
    pattern: /\b(fortinet|fortigate|fortios|fortimanager|fortianalyzer|config system|diagnose debug)\b/i,
    deviceType: () => "FortiGate (Firewall)",
  },
  {
    name: "Cisco",
    slug: "cisco",
    pattern: /\b(cisco|ios[- ]?xe|ios[- ]?xr|nx-os|nexus|catalyst|asa|firepower|router bgp|show ip |show run|show interface|conf(?:igure)? terminal)\b/i,
    deviceType: (text) =>
      /\b(nexus|nx-os)\b/i.test(text)
        ? "Nexus (Data Center Switch)"
        : /\b(asa|firepower|ftd|fmc)\b/i.test(text)
          ? "ASA/Firepower (Firewall)"
          : /\b(catalyst|switchport)\b/i.test(text)
            ? "Catalyst (Switch)"
            : "IOS/IOS-XE/IOS-XR Router",
  },
  {
    name: "Palo Alto Networks",
    slug: "palo-alto",
    pattern: /\b(palo alto|pan-os|panorama|set deviceconfig|show session all)\b/i,
    deviceType: () => "PAN-OS Firewall",
  },
  {
    name: "Check Point",
    slug: "check-point",
    pattern: /\b(check point|gaia|clish|fw ctl|cpstat|smartconsole)\b/i,
    deviceType: () => "Security Gateway",
  },
  {
    name: "Linux",
    slug: "linux",
    pattern: /\b(linux|ubuntu|centos|debian|systemctl|journalctl|ip route|iptables|nft|nmcli|apt |yum |dnf )\b/i,
    deviceType: () => "Linux Host",
  },
  {
    name: "Microsoft",
    slug: "microsoft",
    pattern: /\b(windows|powershell|cmd\.exe|Get-Net|New-Net|netsh|ipconfig)\b/i,
    deviceType: () => "Windows Host",
  },
];

const TECHNOLOGY_RULES = [
  { name: "BGP", slug: "bgp", pattern: /\bbgp\b|neighbor\s+\S+\s+remote-as|route-reflector/i },
  { name: "OSPF", slug: "ospf", pattern: /\bospf\b|router-id|area\s+\d/i },
  { name: "EIGRP", slug: "eigrp", pattern: /\beigrp\b/i },
  { name: "MPLS / L2VPN / VPLS", slug: "mpls-l2vpn-vpls", pattern: /\bmpls\b|l2vpn|vpls|pseudowire|xconnect/i },
  { name: "VLAN / Switching", slug: "vlan-switching", pattern: /\bvlan\b|switchport|spanning-tree|etherchannel|port-channel|lacp/i },
  { name: "VPN (IPsec/SSL)", slug: "vpn", pattern: /\b(ipsec|ikev|vpn|wireguard|openvpn|tunnel)\b/i },
  { name: "Firewall / Security Policy", slug: "firewall", pattern: /\b(firewall|access-list|security policy|policy-map|filter|acl|iptables|nft)\b/i },
  { name: "NAT", slug: "nat", pattern: /\bnat\b|masquerade|source-nat|destination-nat/i },
  { name: "QoS", slug: "qos", pattern: /\b(qos|class-map|policy-map|queue|polic|shap)\w*/i },
  { name: "DHCP / DNS", slug: "dhcp-dns", pattern: /\b(dhcp|dns|named|bind9|resolver)\b/i },
  { name: "AAA / RADIUS / TACACS+", slug: "aaa-radius-tacacs", pattern: /\b(aaa|radius|tacacs|dot1x|802\.1x|ise)\b/i },
  { name: "Monitoring / Logging", slug: "monitoring-logging", pattern: /\b(snmp|syslog|netflow|telemetry|logging|ntp)\b/i },
  { name: "Automation / API", slug: "automation-api", pattern: /\b(netconf|restconf|api|python|ansible|terraform|curl)\b/i },
  { name: "System Administration", slug: "system-administration", pattern: /\b(systemctl|journalctl|apt|yum|dnf|diskpart|netsh|powershell)\b/i },
] as const;

const READ_ONLY_PREFIX = /^(show|display|get|monitor|ping|traceroute|tracert|test|verify|check|status|list|print|ipconfig|ifconfig|netstat|ss\b|dig\b|nslookup|journalctl|cat\b|grep\b|tail\b|head\b|ls\b|pwd\b|whoami|route print|Get-)/i;
const CONFIG_PREFIX = /^(set|delete|edit|configure|config|conf t|router |interface |ip |ipv6 |no |undo |add |create |enable|disable|clear|reset|reload|reboot|restart|shutdown|write|copy|commit|save|install|remove|apt |yum |dnf |systemctl (start|stop|restart|enable|disable)|New-|Set-|Remove-|\/)/i;
const PROMPT_PREFIX = /^(?:[\w.-]+)?(?:\([^)]*\))?[#>$]\s*/;
const OUTPUT_LINE = /^(?:success|failed|warning|error|total|bytes|packets|uptime|cpu|memory|interface\s+status|protocol\s+address)\b/i;

function normalizeLine(raw: string): string {
  return raw
    .replace(/^\s*(?:\$\s+|>\s+)/, "")
    .replace(PROMPT_PREFIX, "")
    .trim();
}

function looksLikeCommand(line: string, inFence: boolean): boolean {
  if (!line || line.length > 2_000 || /^(```|~~~|#\s|<!--|\||[-=*]{3,})/.test(line)) return false;
  if (OUTPUT_LINE.test(line)) return false;
  if (READ_ONLY_PREFIX.test(line) || CONFIG_PREFIX.test(line)) return true;
  if (inFence && /^[a-zA-Z][\w./:-]*(?:\s+[-/\w.[\]{}:=@]+){1,}/.test(line) && !/[.!?]$/.test(line)) return true;
  return false;
}

function detectVendor(context: string) {
  const match = VENDOR_RULES.find((rule) => rule.pattern.test(context));
  return match ?? {
    name: "Vendor-neutral / Multi-vendor",
    slug: "vendor-neutral",
    deviceType: () => null,
  };
}

function detectTechnology(context: string) {
  return TECHNOLOGY_RULES.find((rule) => rule.pattern.test(context)) ?? {
    name: "Network Operations (General)",
    slug: "network-operations-general",
  };
}

function commandTitle(command: string, technology: string, heading: string): string {
  const action = READ_ONLY_PREFIX.test(command) ? "Verify" : "Configure";
  const usefulHeading = heading.replace(/^#+\s*/, "").trim();
  return `${action} ${usefulHeading || technology}`.slice(0, 200);
}

function purposeFor(command: string, technology: string, heading: string): string {
  const mode = READ_ONLY_PREFIX.test(command) ? "inspect or verify" : "configure or change";
  return `Use this ${technology} command to ${mode} ${heading || "the related network function"}.`;
}

function riskFor(command: string): { riskLevel: RiskLevel; isConfigChange: boolean } {
  if (READ_ONLY_PREFIX.test(command)) return { riskLevel: "LOW", isConfigChange: false };
  if (/\b(delete|erase|format|reload|reboot|factory|reset|clear (?:config|configuration|all)|shutdown)\b/i.test(command)) {
    return { riskLevel: "CRITICAL", isConfigChange: true };
  }
  if (CONFIG_PREFIX.test(command)) return { riskLevel: "MEDIUM", isConfigChange: true };
  return { riskLevel: "LOW", isConfigChange: false };
}

export function commandIdentity(vendorSlug: string, commandText: string): string {
  const normalized = commandText.trim().toLowerCase().replace(/\s+/g, " ");
  return createHash("sha256").update(`${vendorSlug}:${normalized}`).digest("hex").slice(0, 20);
}

export function extractCommandsFromMarkdown(input: {
  title: string;
  content: string;
  sourcePath?: string | null;
}): ExtractedCommand[] {
  const lines = input.content.split(/\r?\n/);
  const extracted: ExtractedCommand[] = [];
  const seen = new Set<string>();
  let heading = input.title.replace(/\.md$/i, "");
  let inFence = false;
  let fenceLanguage = "";

  for (const raw of lines) {
    const fence = raw.match(/^\s*(```|~~~)\s*([\w+-]*)/);
    if (fence) {
      inFence = !inFence;
      fenceLanguage = inFence ? fence[2] || "" : "";
      continue;
    }
    const headingMatch = raw.match(/^#{1,6}\s+(.+)/);
    if (headingMatch && !inFence) {
      heading = headingMatch[1].trim();
      continue;
    }

    const command = normalizeLine(raw);
    if (!looksLikeCommand(command, inFence)) continue;
    const context = [input.sourcePath, input.title, heading, fenceLanguage, command].filter(Boolean).join("\n");
    const vendorRule = detectVendor(context);
    const technology = detectTechnology(context);
    const identity = commandIdentity(vendorRule.slug, command);
    if (seen.has(identity)) continue;
    seen.add(identity);
    const risk = riskFor(command);
    extracted.push({
      commandText: command,
      title: commandTitle(command, technology.name, heading),
      description: `${vendorRule.name} command extracted from “${input.title}” under “${heading}”. Review the source context before production execution.`,
      purpose: purposeFor(command, technology.name, heading),
      vendor: { name: vendorRule.name, slug: vendorRule.slug },
      deviceType: vendorRule.deviceType(context),
      technology: { name: technology.name, slug: technology.slug },
      ...risk,
    });
  }

  return extracted;
}
