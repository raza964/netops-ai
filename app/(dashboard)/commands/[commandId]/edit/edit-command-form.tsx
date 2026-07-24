"use client";

import { useActionState, useState } from "react";
import { updateCommandAction } from "../actions";
import { riskLevelValues } from "@/lib/validation/command";

type Vendor = { id: string; name: string; deviceTypes: { id: string; name: string }[] };
type Technology = { id: string; name: string };
type Command = {
  id: string;
  title: string;
  commandText: string;
  description: string;
  purpose: string | null;
  expectedOutput: string | null;
  vendorId: string;
  deviceTypeId: string | null;
  technologyId: string | null;
  riskLevel: string;
  isConfigChange: boolean;
};

const inputClass =
  "mt-1 w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50";
const labelClass = "block text-sm font-medium text-zinc-700 dark:text-zinc-300";

export function EditCommandForm({
  command,
  vendors,
  technologies,
}: {
  command: Command;
  vendors: Vendor[];
  technologies: Technology[];
}) {
  const action = updateCommandAction.bind(null, command.id);
  const [error, formAction, pending] = useActionState(action, undefined);
  const [vendorId, setVendorId] = useState(command.vendorId);

  const deviceTypes = vendors.find((vendor) => vendor.id === vendorId)?.deviceTypes ?? [];

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <div>
        <label className={labelClass}>Title</label>
        <input name="title" required maxLength={200} defaultValue={command.title} className={inputClass} />
      </div>

      <div>
        <label className={labelClass}>Command</label>
        <input
          name="commandText"
          required
          maxLength={2000}
          defaultValue={command.commandText}
          className={`${inputClass} font-mono`}
        />
      </div>

      <div>
        <label className={labelClass}>Description</label>
        <textarea
          name="description"
          required
          rows={3}
          maxLength={2000}
          defaultValue={command.description}
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>Purpose / use case (optional)</label>
        <textarea
          name="purpose"
          rows={2}
          maxLength={1000}
          defaultValue={command.purpose ?? ""}
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>Expected output (optional)</label>
        <textarea
          name="expectedOutput"
          rows={4}
          maxLength={5000}
          defaultValue={command.expectedOutput ?? ""}
          className={`${inputClass} font-mono`}
        />
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
            defaultValue={vendorId === command.vendorId ? command.deviceTypeId ?? "" : ""}
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
          <select name="technologyId" defaultValue={command.technologyId ?? ""} className={inputClass}>
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
          <select name="riskLevel" required defaultValue={command.riskLevel} className={inputClass}>
            {riskLevelValues.map((risk) => (
              <option key={risk} value={risk}>
                {risk}
              </option>
            ))}
          </select>
        </div>
      </div>

      <label className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-400">
        <input type="checkbox" name="isConfigChange" defaultChecked={command.isConfigChange} className="rounded border-zinc-300" />
        This command changes device configuration (not read-only)
      </label>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900"
      >
        {pending ? "Saving..." : "Save Changes"}
      </button>
    </form>
  );
}
