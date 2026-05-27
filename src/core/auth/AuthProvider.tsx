import { createContext, useContext, useEffect, useState } from 'react'
import { onIdTokenChanged, type User } from 'firebase/auth'
import { auth } from './firebase'

interface AuthContextValue {
  user: User | null
  claims: Record<string, unknown>
  loading: boolean
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  claims: {},
  loading: true,
})

const DEV_BYPASS = import.meta.env.VITE_DEV_BYPASS_AUTH === 'true'

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [claims, setClaims] = useState<Record<string, unknown>>({})
  const [loading, setLoading] = useState(!DEV_BYPASS)

  useEffect(() => {
    if (DEV_BYPASS) {
      // Fake user object with just enough shape to satisfy consumers
      setUser({ displayName: 'Dev User', email: 'dev@renovationsdelivered.com', uid: 'dev-local' } as unknown as User)
      setClaims({ role: 'executive' })
      setLoading(false)
      return
    }

    return onIdTokenChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const result = await firebaseUser.getIdTokenResult()
        setClaims(result.claims)
      } else {
        setClaims({})
      }
      setUser(firebaseUser)
      setLoading(false)
    })
  }, [])

  return (
    <AuthContext.Provider value={{ user, claims, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
