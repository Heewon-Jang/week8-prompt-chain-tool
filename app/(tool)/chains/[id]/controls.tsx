"use client";

import { useActionState, useState, useTransition } from "react";
import {
  createChain,
  createStep,
  deleteChain,
  deleteStep,
  moveStep,
  runChain,
  updateChain,
  updateStep,
} from "../../../actions";
import { resizeImage } from "@/lib/resize-image";
import type { StepRow } from "./page";

const MAX_IMAGE_SIZE = 1024;
const field =
  "w-full rounded border border-gray-300 bg-white px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-950";
const card = "rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900";

export function CreateChainForm() {
  const [state, action, pending] = useActionState(createChain, {});
  return (
    <form action={action} className={`space-y-3 ${card}`}>
      <h2 className="font-semibold">New chain</h2>
      <input name="name" required placeholder="Name, e.g. Deadpan captions" className={field} disabled={pending} />
      <textarea name="description" rows={2} placeholder="What it does (optional)" className={field} disabled={pending} />
      <Button type="submit" primary disabled={pending}>
        {pending ? "Creating…" : "Create chain"}
      </Button>
      {state.error && <p className="text-sm text-red-600">{state.error}</p>}
    </form>
  );
}

export function ChainForm({ chainId, name, description }: { chainId: number; name: string; description: string }) {
  const [state, action, pending] = useActionState(updateChain.bind(null, chainId), {});
  const [deleting, startDelete] = useTransition();
  const [deleteError, setDeleteError] = useState("");

  return (
    <form action={action} className={`space-y-3 ${card}`}>
      <input name="name" required defaultValue={name} className={`${field} text-lg font-bold`} disabled={pending} />
      <textarea
        name="description"
        rows={2}
        defaultValue={description}
        placeholder="Description"
        className={field}
        disabled={pending}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" primary disabled={pending}>
          Save chain
        </Button>
        <Button
          danger
          disabled={deleting}
          onClick={() => {
            if (!confirm("Delete this chain and all its steps? Media it made stays in the app.")) return;
            startDelete(async () => setDeleteError((await deleteChain(chainId)).error ?? ""));
          }}
        >
          {deleting ? "Deleting…" : "Delete chain"}
        </Button>
        <span className="text-xs text-gray-500">{state.message}</span>
      </div>
      {(state.error || deleteError) && <p className="text-sm text-red-600">{state.error || deleteError}</p>}
    </form>
  );
}

export function StepEditor({
  chainId,
  step,
  isFirst,
  isLast,
}: {
  chainId: number;
  step: StepRow;
  isFirst: boolean;
  isLast: boolean;
}) {
  const [status, setStatus] = useState({ error: "", message: "" });
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<{ error?: string; message?: string }>) =>
    startTransition(async () => {
      const result = await fn();
      setStatus({ error: result.error ?? "", message: result.message ?? "" });
    });

  return (
    <li className={`${card} ${pending ? "opacity-60" : ""}`}>
      {/* onSubmit rather than action: React would reset the edits if the save failed. */}
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          const formData = new FormData(e.currentTarget);
          run(() => updateStep(chainId, step.id, formData));
        }}
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
            {step.step_order}
          </span>
          <input name="name" required defaultValue={step.name} className={`${field} flex-1 font-medium`} />
          <Button onClick={() => run(() => moveStep(chainId, step.id, -1))} disabled={pending || isFirst} title="Move up">
            ↑
          </Button>
          <Button onClick={() => run(() => moveStep(chainId, step.id, 1))} disabled={pending || isLast} title="Move down">
            ↓
          </Button>
        </div>
        <textarea name="prompt_template" required rows={4} defaultValue={step.prompt_template} className={`${field} font-mono text-xs`} />
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1 text-sm">
            <input type="checkbox" name="include_image" defaultChecked={step.include_image} /> Send image
          </label>
          <Button type="submit" primary disabled={pending}>
            Save step
          </Button>
          <Button
            danger
            disabled={pending}
            onClick={() => {
              if (!confirm(`Delete step ${step.step_order}?`)) return;
              run(() => deleteStep(chainId, step.id));
            }}
          >
            Delete
          </Button>
          <span className="text-xs text-gray-500">{status.message}</span>
        </div>
        {status.error && <p className="text-sm text-red-600">{status.error}</p>}
      </form>
    </li>
  );
}

export function AddStepForm({ chainId }: { chainId: number }) {
  const [status, setStatus] = useState({ error: "", message: "" });
  // Bumped after a successful add so the form remounts empty.
  const [formKey, setFormKey] = useState(0);
  const [pending, startTransition] = useTransition();

  return (
    <form
      key={formKey}
      className={`space-y-2 border-dashed ${card}`}
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        startTransition(async () => {
          const result = await createStep(chainId, {}, formData);
          setStatus({ error: result.error ?? "", message: result.message ?? "" });
          if (!result.error) setFormKey((k) => k + 1);
        });
      }}
    >
      <p className="text-sm font-semibold">Add a step</p>
      <input name="name" required placeholder="Step name, e.g. Describe the image" className={field} disabled={pending} />
      <textarea
        name="prompt_template"
        required
        rows={3}
        placeholder="Prompt, e.g. Take this description and write five short, funny captions as a JSON array: {input}"
        className={`${field} font-mono text-xs`}
        disabled={pending}
      />
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1 text-sm">
          <input type="checkbox" name="include_image" disabled={pending} /> Send image
        </label>
        <Button type="submit" primary disabled={pending}>
          {pending ? "Adding…" : "Add step"}
        </Button>
        <span className="text-xs text-gray-500">{status.message}</span>
      </div>
      {status.error && <p className="text-sm text-red-600">{status.error}</p>}
    </form>
  );
}

export function GenerateForm({ chainId, disabled }: { chainId: number; disabled: boolean }) {
  const [state, action, pending] = useActionState(runChain.bind(null, chainId), {});
  const [image, setImage] = useState("");
  const [photoError, setPhotoError] = useState("");

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setPhotoError("That file isn't an image.");
      return;
    }
    try {
      setPhotoError("");
      setImage(await resizeImage(file, MAX_IMAGE_SIZE, { quality: 0.8 }));
    } catch (error) {
      setPhotoError((error as Error).message);
    }
  };

  return (
    <section className={`space-y-3 ${card}`}>
      <h2 className="text-lg font-semibold">✨ Generate media with this chain</h2>
      <form action={action} className="space-y-3">
        <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-300 p-4 text-center hover:border-blue-400 dark:border-gray-700">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt="Selected photo" className="max-h-48 rounded" />
          ) : (
            <span className="text-sm text-gray-600 dark:text-gray-400">📷 Click to choose a photo</span>
          )}
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            disabled={pending}
            onChange={(e) => pickPhoto(e.target.files?.[0])}
          />
        </label>
        <input type="hidden" name="image" value={image} />
        <input name="hint" maxLength={200} placeholder="Context for {hint} (optional)" className={field} disabled={pending} />
        <Button type="submit" primary disabled={!image || pending || disabled}>
          {pending ? "Running the chain… (can take a minute)" : "Run chain"}
        </Button>
        {disabled && <p className="text-xs text-gray-500">Add a step first.</p>}
        {photoError && <p className="text-sm text-red-600">{photoError}</p>}
        {state.error && <p className="text-sm text-red-600">{state.error}</p>}
        {state.message && <p className="text-sm text-green-700 dark:text-green-400">{state.message}</p>}
      </form>
    </section>
  );
}

function Button({
  children,
  onClick,
  disabled,
  primary,
  danger,
  title,
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  primary?: boolean;
  danger?: boolean;
  title?: string;
  type?: "button" | "submit";
}) {
  const style = primary
    ? "bg-blue-600 text-white hover:bg-blue-700"
    : danger
      ? "border border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
      : "border border-gray-300 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-800";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`shrink-0 cursor-pointer rounded-lg px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40 ${style}`}
    >
      {children}
    </button>
  );
}
