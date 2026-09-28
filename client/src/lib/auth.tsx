import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, tokenStore } from './api'
import type { AuthResponse, User } from './types'

interface AuthState {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<User>
  register: (data: { fullName: string; email: string; password: string; targetScore: number | null }) => Promise<User>
  logout: () => void
  setUser: (u: User) => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(() => !!tokenStore.get())

  useEffect(() => {
    if (!tokenStore.get()) return
    api.get<User>('/auth/me')
      .then((r) => setUser(r.data))
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false))
  }, [])

  const handle = useCallback((data: AuthResponse) => {
    tokenStore.set(data.token)
    setUser(data.user)
    return data.user
  }, [])

  const login = useCallback(
    async (email: string, password: string) => handle((await api.post<AuthResponse>('/auth/login', { email, password })).data),
    [handle],
  )

  const register = useCallback(
    async (data: { fullName: string; email: string; password: string; targetScore: number | null }) =>
      handle((await api.post<AuthResponse>('/auth/register', data)).data),
    [handle],
  )

  const logout = useCallback(() => {
    tokenStore.clear()
    setUser(null)
  }, [])

  const value = useMemo(() => ({ user, loading, login, register, logout, setUser }), [user, loading, login, register, logout])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
