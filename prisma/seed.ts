import "dotenv/config";
import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { prisma } from "../lib/db";

const SALT_ROUNDS = 12;

const VENDORS = [
  { name: "Juniper", slug: "juniper" },
  { name: "Cisco", slug: "cisco" },
  { name: "MikroTik", slug: "mikrotik" },
  { name: "Huawei", slug: "huawei" },
  { name: "Fortinet", slug: "fortinet" },
];

const DEVICE_TYPES_BY_VENDOR_SLUG: Record<string, string[]> = {
  juniper: ["MX Series (Router)", "SRX Series (Firewall)", "EX Series (Switch)"],
  cisco: ["ISR/ASR (Router)", "Catalyst (Switch)", "Nexus (Data Center Switch)", "ASA/Firepower (Firewall)"],
  mikrotik: ["RouterBOARD", "CCR (Cloud Core Router)", "CRS (Switch)"],
  huawei: ["NE Series (Router)", "AR Series (Router)", "S Series (Switch)"],
  fortinet: ["FortiGate (Firewall)", "FortiSwitch", "FortiAP (Wireless)"],
};

const TECHNOLOGIES = [
  { name: "BGP", slug: "bgp" },
  { name: "OSPF", slug: "ospf" },
  { name: "VLAN / Switching", slug: "vlan-switching" },
  { name: "VPN (IPsec/SSL)", slug: "vpn" },
  { name: "Firewall / Security Policy", slug: "firewall" },
  { name: "Wireless", slug: "wireless" },
  { name: "Routing (General)", slug: "routing-general" },
  { name: "QoS", slug: "qos" },
  { name: "NAT", slug: "nat" },
  { name: "DHCP / DNS", slug: "dhcp-dns" },
];

const SEED_ACCOUNTS: Array<{ name: string; email: string; password: string; role: Role }> = [
  { name: "Admin User", email: "admin@netops.local", password: "ChangeMe123!", role: Role.ADMIN },
  { name: "Demo Engineer", email: "engineer@netops.local", password: "ChangeMe123!", role: Role.ENGINEER },
  { name: "Demo Viewer", email: "viewer@netops.local", password: "ChangeMe123!", role: Role.VIEWER },
];

async function seedVendorsAndTechnologies() {
  for (const vendor of VENDORS) {
    const createdVendor = await prisma.vendor.upsert({
      where: { slug: vendor.slug },
      update: {},
      create: vendor,
    });

    const deviceTypeNames = DEVICE_TYPES_BY_VENDOR_SLUG[vendor.slug] ?? [];
    for (const name of deviceTypeNames) {
      await prisma.deviceType.upsert({
        where: { vendorId_name: { vendorId: createdVendor.id, name } },
        update: {},
        create: { name, vendorId: createdVendor.id },
      });
    }
  }

  for (const technology of TECHNOLOGIES) {
    await prisma.technology.upsert({ where: { slug: technology.slug }, update: {}, create: technology });
  }
}

async function seedUsers() {
  for (const account of SEED_ACCOUNTS) {
    const passwordHash = await bcrypt.hash(account.password, SALT_ROUNDS);
    await prisma.user.upsert({
      where: { email: account.email },
      update: {},
      create: {
        name: account.name,
        email: account.email,
        passwordHash,
        role: account.role,
      },
    });
  }
}

async function main() {
  await seedVendorsAndTechnologies();
  await seedUsers();

  console.log("Seed complete.");
  console.log("Seeded accounts (dev only - change these passwords):");
  for (const account of SEED_ACCOUNTS) {
    console.log(`  ${account.role.padEnd(9)} ${account.email} / ${account.password}`);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
