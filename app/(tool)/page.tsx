import Link from "next/link";
import { requireSuperadmin } from "@/lib/supabase/server";
import { CreateChainForm } from "./chains/[id]/controls";

// READ all prompt chains, with step and media counts.
export default async function ChainsPage() {
  const { supabase } = await requireSuperadmin();
  const [{ data: chains, error }, { data: steps }, { data: runs }] = await Promise.all([
    supabase.from("prompt_chains").select("id, name, description, created_at").order("id"),
    supabase.from("prompt_chain_steps").select("chain_id"),
    supabase.from("generation_requests").select("chain_id").eq("status", "succeeded"),
  ]);
  const count = (rows: { chain_id: number | null }[] | null, id: number) =>
    (rows ?? []).filter((r) => r.chain_id === id).length;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold">Prompt chains</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">
          A chain is a list of LLM steps; each step&apos;s output feeds the next, and the last
          step&apos;s output becomes captions.
        </p>
      </header>

      {error && <p className="text-sm text-red-600">Couldn&apos;t load chains: {error.message}</p>}
      <ul className="grid gap-3 md:grid-cols-2">
        {(chains ?? []).map((c) => (
          <li key={c.id}>
            <Link
              href={`/chains/${c.id}`}
              className="block h-full rounded-xl border border-gray-200 bg-white p-4 hover:border-blue-400 dark:border-gray-800 dark:bg-gray-900"
            >
              <p className="font-semibold">{c.name}</p>
              {c.description && <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">{c.description}</p>}
              <p className="mt-2 text-xs text-gray-500">
                {count(steps, c.id)} steps · {count(runs, c.id)} media generated
              </p>
            </Link>
          </li>
        ))}
        {!chains?.length && !error && <p className="text-sm text-gray-500">No chains yet.</p>}
      </ul>

      <CreateChainForm />
    </div>
  );
}
