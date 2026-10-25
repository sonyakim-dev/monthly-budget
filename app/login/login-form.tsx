'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { requestMagicLink, type LoginState } from './actions'

export function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(requestMagicLink, { status: 'idle' })

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </div>
      <Button type="submit" className="h-11 w-full" disabled={pending}>
        {pending ? 'Sending…' : 'Email me a sign-in link'}
      </Button>
      {state.message && (
        <p role="status" className={state.status === 'error' ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>
          {state.message}
        </p>
      )}
    </form>
  )
}
