import LoginButton from "./login-button";

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6 rounded-2xl border border-gray-200 bg-white p-8 text-center shadow-sm dark:border-gray-800 dark:bg-gray-900">
        <div className="space-y-2">
          <p className="text-3xl">🔒</p>
          <h1 className="text-xl font-bold">Prompt Chain Tool</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Superadmins only. Sign in with the Google account marked as a superadmin.
          </p>
        </div>
        <LoginButton />
      </div>
    </main>
  );
}
