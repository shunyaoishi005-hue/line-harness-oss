'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { API_KEY_STORAGE_KEY, CSRF_STORAGE_KEY } from '@/lib/api'
import { getApiBase } from '@/lib/api-base'
import { Banner } from '@cloudflare/kumo/components/banner'
import { Button } from '@cloudflare/kumo/components/button'
import { Input } from '@cloudflare/kumo/components/input'
import { LayerCard } from '@cloudflare/kumo/components/layer-card'

export default function LoginPage() {
  const [apiKey, setApiKey] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const savedKey = localStorage.getItem(API_KEY_STORAGE_KEY)
    if (savedKey) setApiKey(savedKey)
  }, [])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedApiKey = apiKey.trim()
    if (!trimmedApiKey) return

    setLoading(true)
    setError('')

    try {
      const apiUrl = getApiBase()
      if (!apiUrl) {
        setError('NEXT_PUBLIC_API_URL が設定されていません')
        setLoading(false)
        return
      }

      const res = await fetch(`${apiUrl}/api/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: trimmedApiKey }),
      })

      if (res.ok) {
        localStorage.setItem(API_KEY_STORAGE_KEY, trimmedApiKey)
        try {
          const loginData = await res.json()
          if (loginData.success && loginData.data) {
            localStorage.setItem('lh_staff_name', loginData.data.name)
            localStorage.setItem('lh_staff_role', loginData.data.role)
          }
          if (loginData.csrfToken) {
            localStorage.setItem(CSRF_STORAGE_KEY, loginData.csrfToken)
          }
        } catch {
          // Profile / CSRF caching is best-effort.
        }
        router.push('/')
      } else if (res.status === 401) {
        setError('APIキーが正しくありません')
      } else {
        let message = 'ログインに失敗しました'
        try {
          const data = await res.json()
          if (data?.error) message = data.error
        } catch {
          // keep default message
        }
        setError(message)
      }
    } catch {
      setError('接続に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-kumo-brand p-4">
      <LayerCard className="w-full max-w-sm p-8 shadow-xl">
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-kumo-brand text-kumo-inverse font-bold text-lg mx-auto mb-3">
            H
          </div>
          <h1 className="text-xl font-bold text-gray-900">L Harness</h1>
          <p className="text-sm text-gray-500 mt-1">管理画面にログイン</p>
        </div>

        <form onSubmit={handleLogin}>
          <div className="mb-4">
            <Input
              label="API Key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="APIキーを入力"
              autoFocus
            />
          </div>

          {error && <Banner className="mb-4" size="sm" variant="error" title="ログインできませんでした" description={error} />}

          <Button
            type="submit"
            variant="primary"
            loading={loading}
            disabled={loading || !apiKey.trim()}
            className="w-full"
          >
            ログイン
          </Button>
        </form>
      </LayerCard>
    </div>
  )
}
