'use client'
import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { API_KEY_STORAGE_KEY, CSRF_STORAGE_KEY } from '@/lib/api'
import { getApiBase } from '@/lib/api-base'

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const pathname = usePathname()
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    let cancelled = false

    if (pathname === '/login') {
      setChecked(true)
      return () => { cancelled = true }
    }

    // Verify the session via the HttpOnly cookie first. Mobile Safari / LINE's
    // in-app browser may block the cross-site cookie, so keep Bearer auth as a
    // fallback using the API key entered on the login screen.
    const checkSession = async () => {
      try {
        const apiUrl = getApiBase()
        const apiKey = localStorage.getItem(API_KEY_STORAGE_KEY)
        const res = await fetch(`${apiUrl}/api/auth/session`, {
          credentials: 'include',
          headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
        })
        if (!res.ok) throw new Error('unauthenticated')
        const data = await res.json()
        if (!data?.success || !data?.data) throw new Error('unauthenticated')
        if (data.data.name) localStorage.setItem('lh_staff_name', data.data.name)
        if (data.data.role) localStorage.setItem('lh_staff_role', data.data.role)
        if (data.csrfToken) localStorage.setItem(CSRF_STORAGE_KEY, data.csrfToken)
        if (!cancelled) setChecked(true)
      } catch {
        if (!cancelled) router.replace('/login')
      }
    }

    checkSession()
    return () => { cancelled = true }
  }, [pathname, router])

  if (!checked) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-[3px] border-gray-200 border-t-green-500 rounded-full" />
      </div>
    )
  }

  return <>{children}</>
}
