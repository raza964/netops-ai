"use client";

import { useActionState, useState } from "react";
import { createCommandAction } from "../actions";
import { riskLevelValues } from "@/lib/validation/command";

type Vendor = { id: string; name: string; deviceTypes: { id: string; name: string }[] };
type Technology = { id: string; name: string };

const inputClass =
  "mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";
const labelClass = "block text-sm font-medium text-zinc-700 dark:text-zinc-300";

export function NewCommandForm({ vendors, technologies }: { vendors: Vendor[]; technologies: Technology[] }) {
  const [error, formAction, pending] = useActionState(createCommandAction, undefined);
  const [vendorId, setVendorId] = useState("");

  const deviceTypes = vendors.find((vendor) => vendor.id === vendorId)?.deviceTypes ?? [];

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <div>
        <label className={labelClass}>Title</label>
        <input name="title" required maxLength={200} className={inputClass} />
      </div>

      <div>
        <label className={labelClass}>Command</label>
        <input
          name="commandText"
          required
          maxLength={2000}
          placeholder="e.g. show ip bgp summary"
          className={`${inputClass} font-mono`}
        />
      </div>

      <div>
        <label className={labelClass}>Description</label>
        <textarea name="description" required rows={3} maxLength={2000} className={inputClass} />
      </div>

      <div>
        <label className={labelClass}>Purpose / use case (optional)</label>
        <textarea name="purpose" rows={2} maxLength={1000} className={inputClass} />
      </div>

      <div>
        <label className={labelClass}>Expected output (optional)</label>
        <textarea name="expectedOutput" rows={4} maxLength={5000} className={`${inputClass} font-mono`} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Vendor</label>
          <select
            name="vendorId"
            required
            value={vendorId}
            onChange={(event) => setVendorId(event.target.value)}
            className={inputClass}
          >
            <option value="">Select vendor</option>
            {vendors.map((vendor) => (
              <option key={vendor.id} value={vendor.id}>
                {vendor.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass}>Device Type (optional)</label>
          <select
            key={vendorId}
            name="deviceTypeId"
            disabled={!vendorId}
            defaultValue=""
            className={`${inputClass} disabled:opacity-50`}
          >
            <option value="">All device types</option>
            {deviceTypes.map((deviceType) => (
              <option key={deviceType.id} value={deviceType.id}>
                {deviceType.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelClass}>Technology (optional)</label>
          <select name="technologyId" defaultValue="" className={inputClass}>
            <option value="">Not technology-specific</option>
            {technologies.map((technology) => (
              <option key={technology.id} value={technology.id}>
                {technology.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass}>Risk Level</label>
          <select name="riskLevel" required defaultValue="LOW" className={inputClass}>
            {riskLevelValues.map((risk) => (
              <option key={risk} value={risk}>
                {risk}
              </option>
            ))}
          </select>
        </div>
      </div>

      <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
        <input type="checkbox" name="isConfigChange" className="rounded border-zinc-300" />
        This command changes device configuration (not read-only)
      </label>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
      >
        {pending ? "Creating..." : "Create Command"}
      </button>
    </form>
  );
}
