import "server-only";
import { prisma } from "../db";

export async function getVendorsWithDeviceTypes() {
  return prisma.vendor.findMany({
    select: {
      id: true,
      name: true,
      deviceTypes: { select: { id: true, name: true }, orderBy: { name: "asc" } },
    },
    orderBy: { name: "asc" },
  });
}

export async function getTechnologies() {
  return prisma.technology.findMany({
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}
