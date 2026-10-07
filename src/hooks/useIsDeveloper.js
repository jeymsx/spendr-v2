import { useAuth } from '../context/AuthContext'
import { isDeveloper } from '../lib/developer'

/** Whether what is for the developer alone is shown here (lib/developer.js). */
export function useIsDeveloper() {
  const { user } = useAuth()
  return isDeveloper(user?.email)
}
