import Link from "next/link";
import { requireSuperadmin } from "@/lib/supabase/server";
import { signOut } from "../actions";
import ThemeToggle from "../theme-toggle";

export default async function ToolLayout({ children }: LayoutProps<"/">) {
  const { profile } = await requireSuperadmin();

  return (
    <div className="flex flex-1 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3 md:px-8 dark:border-gray-800 dark:bg-gray-900">
        <Link href="/" className="text-lg font-bold">
          ⛓️ Prompt Chain Tool
        </Link>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <span className="hidden text-xs text-gray-500 sm:inline dark:text-gray-400">{profile.email}</span>
          <form action={signOut}>
            <button className="cursor-pointer rounded-lg border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
