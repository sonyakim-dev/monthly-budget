import { LoginForm } from './login-form'

const NOTICES: Record<string, string> = {
  'not-allowed': "This account isn't allowed to use this app.",
  link: 'That sign-in link is invalid or has expired. Request a new one.',
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams
  const notice = error ? NOTICES[error] : undefined

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4">
      <h1 className="text-2xl font-semibold">Sign in</h1>
      {notice && (
        <p role="alert" className="text-sm text-destructive">
          {notice}
        </p>
      )}
      <LoginForm />
    </main>
  )
}
