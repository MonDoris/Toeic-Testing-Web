import axios, { AxiosError } from 'axios'

const TOKEN_KEY = 'bubble.token'

export const tokenStore = {
  get: () => {
    try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
  },
  set: (token: string) => {
    try { localStorage.setItem(TOKEN_KEY, token) } catch { /* private mode */ }
  },
  clear: () => {
    try { localStorage.removeItem(TOKEN_KEY) } catch { /* private mode */ }
  },
}

export const api = axios.create({ baseURL: '/api' })

api.interceptors.request.use((config) => {
  const token = tokenStore.get()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (r) => r,
  (error: AxiosError) => {
    if (error.response?.status === 401 && !error.config?.url?.startsWith('/auth/login')) {
      tokenStore.clear()
      if (!location.pathname.startsWith('/login')) {
        location.href = `/login?next=${encodeURIComponent(location.pathname)}`
      }
    }
    return Promise.reject(error)
  },
)

interface ApiErrorBody { title?: string; errors?: string[] | Record<string, string[]> }

/** Trích thông báo lỗi dễ đọc từ phản hồi API. */
export function errorMessage(err: unknown, fallback = 'Đã có lỗi xảy ra. Vui lòng thử lại.'): string {
  if (axios.isAxiosError(err)) {
    const body = err.response?.data as ApiErrorBody | undefined
    if (body?.errors) {
      const list = Array.isArray(body.errors) ? body.errors : Object.values(body.errors).flat()
      if (list.length) return list.join(' ')
    }
    if (body?.title) return body.title
    if (!err.response) return 'Không kết nối được tới máy chủ.'
  }
  return fallback
}

export function errorList(err: unknown): string[] {
  if (axios.isAxiosError(err)) {
    const body = err.response?.data as ApiErrorBody | undefined
    if (body?.errors) return Array.isArray(body.errors) ? body.errors : Object.values(body.errors).flat()
  }
  return [errorMessage(err)]
}
