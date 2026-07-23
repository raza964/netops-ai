"use client";

import { useActionState, useState } from "react";
import { createCaseAction } from "../actions";
import { severityValues } from "@/lib/validation/case";

type Vendor = { id: string; name: string; deviceTypes: { id: string; name: string }[] };
type Technology = { id: string; name: string };

const inputClass =
  "mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";
const labelClass = "block text-sm font-medium text-zinc-700 dark:text-zinc-300";

export function NewCaseForm({ vendors, technologies }: { vendors: Vendor[]; technologies: Technology[] }) {
  const [error, formAction, pending] = useActionState(createCaseAction, undefined);
  const [vendorId, setVendorId] = useState("");

  const deviceTypes = vendors.find((vendor) => vendor.id === vendorId)?.deviceTypes ?? [];

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <div>
        <label className={labelClass}>Title</label>
        <input name="title" required maxLength={200} className={inputClass} />
      </div>

      <div>
        <label className={labelClass}>Description</label>
        <textarea name="description" required rows={4} className={inputClass} />
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
          <label className={labelClass}>Device Type</label>
          <select key={vendorId} name="deviceTypeId" required disabled={!vendorId} className={`${inputClass} disabled:opacity-50`}>
            <option value="">Select device type</option>
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
          <label className={labelClass}>Technology</label>
          <select name="technologyId" required defaultValue="" className={inputClass}>
            <option value="">Select technology</option>
            {technologies.map((technology) => (
              <option key={technology.id} value={technology.id}>
                {technology.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className={labelClass}>Severity</label>
          <select name="severity" required defaultValue="" className={inputClass}>
            <option value="">Select severity</option>
            {severityValues.map((severity) => (
              <option key={severity} value={severity}>
                {severity}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
      >
        {pending ? "Creating..." : "Create Case"}
      </button>
    </form>
  );
}
