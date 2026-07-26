import { describe, expect, it } from "vitest";
import { commandIdentity, extractCommandsFromMarkdown } from "@/lib/command-extraction";

describe("structured command extraction", () => {
  it("classifies Cisco BGP show and configuration commands", () => {
    const commands = extractCommandsFromMarkdown({
      title: "Cisco BGP Configuration.md",
      sourcePath: "routing/cisco/BGP.md",
      content: `# BGP Configuration\n\n\`\`\`ios\nrouter bgp 65001\nneighbor 192.0.2.1 remote-as 65002\nshow ip bgp summary\n\`\`\``,
    });
    expect(commands.map((command) => command.commandText)).toContain("router bgp 65001");
    expect(commands.map((command) => command.commandText)).toContain("show ip bgp summary");
    expect(commands.every((command) => command.vendor.slug === "cisco")).toBe(true);
    expect(commands.every((command) => command.technology.slug === "bgp")).toBe(true);
    expect(commands.find((command) => command.commandText === "show ip bgp summary")?.isConfigChange).toBe(false);
  });

  it("classifies Junos set commands as Juniper configuration changes", () => {
    const [command] = extractCommandsFromMarkdown({
      title: "Juniper BGP.md",
      content: "```junos\nset protocols bgp group TRANSIT neighbor 203.0.113.1 peer-as 64500\n```",
    });
    expect(command.vendor.slug).toBe("juniper");
    expect(command.technology.slug).toBe("bgp");
    expect(command.isConfigChange).toBe(true);
    expect(command.riskLevel).toBe("MEDIUM");
  });

  it("recognizes MikroTik RouterOS paths", () => {
    const [command] = extractCommandsFromMarkdown({
      title: "MikroTik routing.md",
      content: "```routeros\n/routing/bgp/connection add name=upstream remote.address=198.51.100.1 remote.as=64501\n```",
    });
    expect(command.vendor.slug).toBe("mikrotik");
    expect(command.technology.slug).toBe("bgp");
    expect(command.isConfigChange).toBe(true);
  });

  it("uses a safe neutral vendor when evidence is insufficient", () => {
    const [command] = extractCommandsFromMarkdown({
      title: "Generic troubleshooting.md",
      content: "```text\nping 192.0.2.10\n```",
    });
    expect(command.vendor.slug).toBe("vendor-neutral");
    expect(command.isConfigChange).toBe(false);
  });

  it("deduplicates identical commands within one source", () => {
    const commands = extractCommandsFromMarkdown({
      title: "Cisco checks.md",
      content: "show ip bgp summary\nshow ip bgp summary",
    });
    expect(commands).toHaveLength(1);
    expect(commandIdentity("cisco", "SHOW  IP BGP summary")).toBe(
      commandIdentity("cisco", "show ip bgp summary"),
    );
  });
});
