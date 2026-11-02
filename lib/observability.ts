import type { Supabase } from "@/lib/supabase/server";

type StepResult = { prompt: string; model: string; response: string };

// Records a prompt chain run in generation_requests and each LLM call in
// llm_responses. Logging never breaks generation: write errors are only printed.
export async function startRequest(supabase: Supabase, chainId: number) {
  const { data: request, error } = await supabase
    .from("generation_requests")
    .insert({ chain_id: chainId })
    .select("id")
    .single();
  if (error) console.error("generation_requests insert:", error.message);
  const requestId: number | null = request?.id ?? null;

  const log = async (table: string, write: PromiseLike<{ error: { message: string } | null }>) => {
    const { error } = await write;
    if (error) console.error(`${table}:`, error.message);
  };

  return {
    // Runs one LLM call, timing it and saving its prompt and raw output.
    async step<T>(stepOrder: number, call: () => Promise<T>, describe: (result: T) => StepResult) {
      const started = Date.now();
      try {
        const result = await call();
        if (requestId) {
          await log(
            "llm_responses",
            supabase.from("llm_responses").insert({
              request_id: requestId,
              step_order: stepOrder,
              latency_ms: Date.now() - started,
              ...describe(result),
            })
          );
        }
        return result;
      } catch (error) {
        if (requestId) {
          await log(
            "llm_responses",
            supabase.from("llm_responses").insert({
              request_id: requestId,
              step_order: stepOrder,
              latency_ms: Date.now() - started,
              model: "unknown",
              prompt: "(not recorded: the call failed)",
              error: (error as Error).message,
            })
          );
        }
        throw error;
      }
    },

    async finish(imageId: number) {
      if (!requestId) return;
      await log(
        "generation_requests",
        supabase
          .from("generation_requests")
          .update({ status: "succeeded", image_id: imageId, finished_at: new Date().toISOString() })
          .eq("id", requestId)
      );
    },

    async fail(message: string) {
      if (!requestId) return;
      await log(
        "generation_requests",
        supabase
          .from("generation_requests")
          .update({ status: "failed", error: message, finished_at: new Date().toISOString() })
          .eq("id", requestId)
      );
    },
  };
}
