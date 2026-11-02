import { signOut } from "../actions";

export default function DeniedPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6 rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="space-y-2">
          <p className="text-3xl">⛔</p>
          <h1 className="text-xl font-bold">Not a superadmin</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            You&apos;re signed in, but this account doesn&apos;t have{" "}
            <code className="rounded bg-gray-100 px-1 dark:bg-gray-800">is_superadmin</code> set,
            so the admin area is closed to you.
          </p>
        </div>
        <form action={signOut}>
          <button className="w-full cursor-pointer rounded-lg border border-gray-300 px-5 py-2.5 font-semibold hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">
            Sign out and try another account
          </button>
        </form>
      </div>
    </main>
  );
}
