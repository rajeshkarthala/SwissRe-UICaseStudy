import React, { createContext, useContext, useState } from 'react'

const RoleContext = createContext(null)

export function RoleProvider({ children, initialRole = 'viewer' }) {
  const [role, setRole] = useState(initialRole)
  return (
    <RoleContext.Provider value={{ role, setRole }}>
      {children}
    </RoleContext.Provider>
  )
}

export function useRole() {
  const ctx = useContext(RoleContext)
  if (!ctx) throw new Error('useRole must be used within RoleProvider')
  return ctx
}

export default RoleContext
