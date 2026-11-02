import type { Supabase } from "@/lib/supabase/server";

const PAGE_SIZE = 1000;
const SIGNED_URL_SECONDS = 60 * 60;

// Supabase caps a select at 1000 rows, so page through the whole table.
export async function fetchAll<T>(
  supabase: Supabase,
  table: string,
  columns: string
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as T[]));
    if (data.length < PAGE_SIZE) return rows;
  }
}

// The images bucket is private, so each photo gets a short-lived signed URL.
export async function signImageUrls(supabase: Supabase, paths: string[]) {
  const urls = new Map<string, string>();
  if (!paths.length) return urls;
  const { data, error } = await supabase.storage
    .from("images")
    .createSignedUrls(paths, SIGNED_URL_SECONDS);
  if (error) throw new Error(error.message);
  for (const { path, signedUrl } of data) {
    if (path && signedUrl) urls.set(path, signedUrl);
  }
  return urls;
}

export type ProfileRow = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  is_superadmin: boolean;
  updated_at: string | null;
};
export type ImageRow = {
  id: number;
  user_id: string;
  storage_path: string;
  description: string | null;
  description_model: string | null;
  created_at: string;
};
export type CaptionRow = {
  id: number;
  image_id: number | null;
  news_id: number | null;
  text: string;
  model: string | null;
  created_at: string;
};
export type VoteRow = {
  id: number;
  caption_id: number;
  user_id: string;
  vote: number;
  created_at: string;
};
export type BattleRow = {
  id: number;
  user_id: string;
  winner_id: number;
  loser_id: number;
  created_at: string;
};
export type NewsRow = { id: number; headline: string; news_date: string };

export async function loadEverything(supabase: Supabase) {
  const [profiles, images, captions, votes, battles, news] = await Promise.all([
    fetchAll<ProfileRow>(
      supabase,
      "profiles",
      "id, email, first_name, last_name, avatar_url, is_superadmin, updated_at"
    ),
    fetchAll<ImageRow>(
      supabase,
      "images",
      "id, user_id, storage_path, description, description_model, created_at"
    ),
    fetchAll<CaptionRow>(supabase, "captions", "id, image_id, news_id, text, model, created_at"),
    fetchAll<VoteRow>(supabase, "caption_votes", "id, caption_id, user_id, vote, created_at"),
    fetchAll<BattleRow>(supabase, "caption_battles", "id, user_id, winner_id, loser_id, created_at"),
    fetchAll<NewsRow>(supabase, "news_items", "id, headline, news_date"),
  ]);
  return { profiles, images, captions, votes, battles, news };
}

export function displayName(p: ProfileRow | undefined) {
  if (!p) return "Unknown user";
  const name = [p.first_name, p.last_name].filter(Boolean).join(" ").trim();
  return name || p.email || "Unnamed user";
}

// Calendar day in New York, where the users are.
export function nyDate(iso: string | Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date(iso));
}

export function nyHour(iso: string) {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      hourCycle: "h23",
    }).format(new Date(iso))
  );
}

export function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

// Elo, same rules as the main app: replay battles oldest first.
export function computeElo(battles: BattleRow[]) {
  const ratings = new Map<number, number>();
  const sorted = [...battles].sort((a, b) => a.id - b.id);
  for (const { winner_id, loser_id } of sorted) {
    const w = ratings.get(winner_id) ?? 1000;
    const l = ratings.get(loser_id) ?? 1000;
    const change = 32 * (1 - 1 / (1 + 10 ** ((l - w) / 400)));
    ratings.set(winner_id, w + change);
    ratings.set(loser_id, l - change);
  }
  return ratings;
}
