import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSuperadmin } from "@/lib/supabase/server";
import { formatDateTime, signImageUrls } from "@/lib/data";
import { ChainForm, GenerateForm, StepEditor, AddStepForm } from "./controls";

// A chain runs several LLM calls in one request; give it room on Vercel.
export const maxDuration = 300;

export type StepRow = {
  id: number;
  step_order: number;
  name: string;
  prompt_template: string;
  include_image: boolean;
};

export default async function ChainPage(props: PageProps<"/chains/[id]">) {
  const id = Number((await props.params).id);
  if (!Number.isInteger(id)) notFound();
  const { supabase } = await requireSuperadmin();

  const { data: chain } = await supabase
    .from("prompt_chains")
    .select("id, name, description")
    .eq("id", id)
    .maybeSingle();
  if (!chain) notFound();

  const [{ data: steps }, { data: runs }] = await Promise.all([
    supabase
      .from("prompt_chain_steps")
      .select("id, step_order, name, prompt_template, include_image")
      .eq("chain_id", id)
      .order("step_order"),
    supabase
      .from("generation_requests")
      .select("image_id, finished_at")
      .eq("chain_id", id)
      .eq("status", "succeeded")
      .not("image_id", "is", null)
      .order("id", { ascending: false }),
  ]);

  // READ the media this chain produced.
  const imageIds = (runs ?? []).map((r) => r.image_id as number);
  const [{ data: images }, { data: captions }] = imageIds.length
    ? await Promise.all([
        supabase.from("images").select("id, storage_path, description").in("id", imageIds),
        supabase.from("captions").select("id, image_id, text").in("image_id", imageIds).order("id"),
      ])
    : [{ data: [] }, { data: [] }];
  const urls = await signImageUrls(supabase, (images ?? []).map((i) => i.storage_path));
  const media = (runs ?? [])
    .map((r) => ({ run: r, image: (images ?? []).find((i) => i.id === r.image_id) }))
    .filter((m) => m.image);

  return (
    <div className="space-y-8">
      <Link href="/" className="text-sm text-blue-600 hover:underline dark:text-blue-400">
        ← All chains
      </Link>

      <ChainForm chainId={chain.id} name={chain.name} description={chain.description ?? ""} />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Steps</h2>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Use <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">{"{input}"}</code> for the
          previous step&apos;s output and{" "}
          <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">{"{hint}"}</code> for the
          uploader&apos;s context. Tick &quot;Send image&quot; to attach the photo to a step.
        </p>
        <ol className="space-y-3">
          {(steps ?? []).map((step, i) => (
            <StepEditor
              key={step.id}
              chainId={chain.id}
              step={step as StepRow}
              isFirst={i === 0}
              isLast={i === (steps ?? []).length - 1}
            />
          ))}
        </ol>
        {!steps?.length && <p className="text-sm text-gray-500">No steps yet. Add the first one below.</p>}
        <AddStepForm chainId={chain.id} />
      </section>

      <GenerateForm chainId={chain.id} disabled={!steps?.length} />

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Media from this chain ({media.length})</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {media.map(({ run, image }) => (
            <article
              key={image!.id}
              className="space-y-3 rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900"
            >
              {urls.get(image!.storage_path) ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={urls.get(image!.storage_path)}
                  alt={image!.description ?? ""}
                  className="aspect-video w-full rounded-lg object-cover"
                />
              ) : (
                <div className="flex aspect-video items-center justify-center rounded-lg bg-gray-100 text-xs text-gray-500 dark:bg-gray-800">
                  File missing
                </div>
              )}
              <ul className="space-y-1 text-sm">
                {(captions ?? [])
                  .filter((c) => c.image_id === image!.id)
                  .map((c) => (
                    <li key={c.id} className="rounded bg-gray-50 px-2 py-1 dark:bg-gray-800">
                      {c.text}
                    </li>
                  ))}
              </ul>
              <p className="text-xs text-gray-500">
                Image #{image!.id}
                {run.finished_at && ` · ${formatDateTime(run.finished_at)}`}
              </p>
            </article>
          ))}
        </div>
        {!media.length && <p className="text-sm text-gray-500">Nothing generated with this chain yet.</p>}
      </section>
    </div>
  );
}
