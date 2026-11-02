"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, requireSuperadmin } from "@/lib/supabase/server";
import { generate } from "@/lib/gemini";
import { startRequest } from "@/lib/observability";

export type FormState = { error?: string; message?: string };

const MAX_IMAGE_LENGTH = 950_000;
const MAX_HINT_LENGTH = 200;
const MAX_CAPTIONS = 10;

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

function slugify(name: string) {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "chain";
  return `${base}-${crypto.randomUUID().slice(0, 6)}`;
}

// CREATE a chain, then open it.
export async function createChain(_prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireSuperadmin();
  const name = text(formData, "name");
  if (!name) return { error: "Give the chain a name." };

  const { data, error } = await supabase
    .from("prompt_chains")
    .insert({ name, slug: slugify(name), description: text(formData, "description") || null })
    .select("id")
    .single();
  if (error) return { error: error.message };

  revalidatePath("/");
  redirect(`/chains/${data.id}`);
}

// UPDATE a chain's name and description.
export async function updateChain(chainId: number, _prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireSuperadmin();
  const name = text(formData, "name");
  if (!name) return { error: "A chain needs a name." };

  const { data, error } = await supabase
    .from("prompt_chains")
    .update({ name, description: text(formData, "description") || null })
    .eq("id", chainId)
    .select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Nothing was updated. Check the admin RLS policies." };

  revalidatePath("/", "layout");
  return { message: "Saved." };
}

// DELETE a chain and (by cascade) its steps. Its media stays, unlinked.
export async function deleteChain(chainId: number): Promise<FormState> {
  const { supabase } = await requireSuperadmin();
  const { data, error } = await supabase.from("prompt_chains").delete().eq("id", chainId).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Nothing was deleted. Check the admin RLS policies." };

  revalidatePath("/", "layout");
  redirect("/");
}

function stepFields(formData: FormData) {
  const name = text(formData, "name");
  const prompt_template = text(formData, "prompt_template");
  if (!name || !prompt_template) throw new Error("A step needs a name and a prompt.");
  return { name, prompt_template, include_image: formData.get("include_image") === "on" };
}

// CREATE a step at the end of the chain.
export async function createStep(chainId: number, _prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase } = await requireSuperadmin();
  try {
    const { data: last } = await supabase
      .from("prompt_chain_steps")
      .select("step_order")
      .eq("chain_id", chainId)
      .order("step_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { error } = await supabase.from("prompt_chain_steps").insert({
      chain_id: chainId,
      step_order: (last?.step_order ?? 0) + 1,
      ...stepFields(formData),
    });
    if (error) return { error: error.message };
  } catch (error) {
    return { error: (error as Error).message };
  }
  revalidatePath(`/chains/${chainId}`);
  return { message: "Step added." };
}

// UPDATE a step's name, prompt, and image flag.
export async function updateStep(chainId: number, stepId: number, formData: FormData): Promise<FormState> {
  const { supabase } = await requireSuperadmin();
  try {
    const { data, error } = await supabase
      .from("prompt_chain_steps")
      .update(stepFields(formData))
      .eq("id", stepId)
      .select("id");
    if (error) return { error: error.message };
    if (!data?.length) return { error: "Nothing was updated. Check the admin RLS policies." };
  } catch (error) {
    return { error: (error as Error).message };
  }
  revalidatePath(`/chains/${chainId}`);
  return { message: "Saved." };
}

// DELETE a step, then close the gap so steps stay numbered 1, 2, 3…
export async function deleteStep(chainId: number, stepId: number): Promise<FormState> {
  const { supabase } = await requireSuperadmin();
  const { data, error } = await supabase.from("prompt_chain_steps").delete().eq("id", stepId).select("id");
  if (error) return { error: error.message };
  if (!data?.length) return { error: "Nothing was deleted. Check the admin RLS policies." };

  const { data: rest } = await supabase
    .from("prompt_chain_steps")
    .select("id, step_order")
    .eq("chain_id", chainId)
    .order("step_order");
  for (const [i, step] of (rest ?? []).entries()) {
    if (step.step_order !== i + 1) {
      await supabase.from("prompt_chain_steps").update({ step_order: i + 1 }).eq("id", step.id);
    }
  }

  revalidatePath(`/chains/${chainId}`);
  return {};
}

// REORDER: swap a step with the one above (-1) or below (1), atomically in SQL.
export async function moveStep(chainId: number, stepId: number, direction: -1 | 1): Promise<FormState> {
  const { supabase } = await requireSuperadmin();
  const { error } = await supabase.rpc("move_prompt_chain_step", { step_id: stepId, direction });
  if (error) return { error: error.message };
  revalidatePath(`/chains/${chainId}`);
  return {};
}

// The last step's output becomes captions: a JSON array, or one per line.
function parseCaptions(output: string) {
  let lines: unknown[];
  try {
    const parsed = JSON.parse(output.replace(/^```(?:json)?\s*|\s*```$/g, ""));
    lines = Array.isArray(parsed) ? parsed : [output];
  } catch {
    lines = output.split("\n");
  }
  return lines
    .map((line) => String(line).replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").replace(/^"|"$/g, "").trim())
    .filter(Boolean)
    .slice(0, MAX_CAPTIONS);
}

// GENERATE media: run every step in order, feeding each output into the next.
export async function runChain(chainId: number, _prev: FormState, formData: FormData): Promise<FormState> {
  const { supabase, user } = await requireSuperadmin();

  const dataUrl = String(formData.get("image") ?? "");
  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!match || dataUrl.length > MAX_IMAGE_LENGTH) return { error: "Choose an image to upload." };
  const [, mimeType, base64] = match;
  const hint = text(formData, "hint").slice(0, MAX_HINT_LENGTH);

  const { data: steps, error: stepsError } = await supabase
    .from("prompt_chain_steps")
    .select("step_order, prompt_template, include_image")
    .eq("chain_id", chainId)
    .order("step_order");
  if (stepsError) return { error: stepsError.message };
  if (!steps?.length) return { error: "Add at least one step first." };

  const run = await startRequest(supabase, chainId);
  const fail = async (message: string) => {
    await run.fail(message);
    return { error: message };
  };

  const outputs: string[] = [];
  let lastModel = "";
  try {
    for (const step of steps) {
      // {input} = previous step's output; {hint} = the uploader's context.
      const prompt = step.prompt_template
        .replaceAll("{input}", outputs.at(-1) ?? "")
        .replaceAll("{hint}", hint || "none");
      const parts = step.include_image
        ? [{ inline_data: { mime_type: mimeType, data: base64 } }, { text: prompt }]
        : [{ text: prompt }];
      const result = await run.step(
        step.step_order,
        () => generate(parts),
        (r) => ({ prompt, model: r.model, response: r.text })
      );
      outputs.push(result.text);
      lastModel = result.model;
    }
  } catch (error) {
    return fail(`The chain failed: ${(error as Error).message}`);
  }

  const captions = parseCaptions(outputs.at(-1)!);
  if (!captions.length) return fail("The last step didn't return any captions.");

  const path = `${user.id}/${crypto.randomUUID()}.jpg`;
  const { error: uploadError } = await supabase.storage
    .from("images")
    .upload(path, Buffer.from(base64, "base64"), { contentType: mimeType });
  if (uploadError) return fail(uploadError.message);
  const {
    data: { publicUrl },
  } = supabase.storage.from("images").getPublicUrl(path);

  const { data: image, error: imageError } = await supabase
    .from("images")
    .insert({
      user_id: user.id,
      storage_path: path,
      image_url: publicUrl,
      description: outputs[0],
      description_model: lastModel,
    })
    .select("id")
    .single();
  if (imageError) return fail(imageError.message);

  const { error: captionError } = await supabase
    .from("captions")
    .insert(captions.map((caption) => ({ image_id: image.id, text: caption, model: lastModel })));
  if (captionError) return fail(captionError.message);
  await run.finish(image.id);

  revalidatePath(`/chains/${chainId}`);
  return { message: `Done: ${captions.length} captions.` };
}
