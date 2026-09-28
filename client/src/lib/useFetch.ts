import { useCallback, useEffect, useRef, useState } from 'react'
import { api, errorMessage } from './api'

/** GET đơn giản kèm trạng thái loading/error và hàm reload. */
export function useFetch<T>(url: string | null, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(!!url)
  const [error, setError] = useState<string | null>(null)
  const seq = useRef(0)

  const load = useCallback(async () => {
    if (!url) return
    const id = ++seq.current
    setLoading(true)
    setError(null)
    try {
      const r = await api.get<T>(url)
      if (id === seq.current) setData(r.data)
    } catch (e) {
      if (id === seq.current) setError(errorMessage(e))
    } finally {
      if (id === seq.current) setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, ...deps])

  useEffect(() => { void load() }, [load])

  return { data, loading, error, reload: load, setData }
}
