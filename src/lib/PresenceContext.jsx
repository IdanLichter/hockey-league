import { createContext, useContext } from 'react'
import { usePresence } from './usePresence'

/**
 * Mounts the global online-presence subscription ONCE (this web client tracks itself)
 * and shares the live { total, web, ios, android } breakdown with the whole tree, so
 * any surface — a header badge, an admin card — reads it without a second socket.
 */
const PresenceCtx = createContext({ total: 0, web: 0, ios: 0, android: 0 })

export function PresenceProvider({ children }) {
  const value = usePresence({ platform: 'web', track: true })
  return <PresenceCtx.Provider value={value}>{children}</PresenceCtx.Provider>
}

export const useOnline = () => useContext(PresenceCtx)
