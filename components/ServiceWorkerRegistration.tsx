'use client'
import { useEffect } from 'react'

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then(registration => {
          console.log('✓ Service Worker registrado com sucesso')
        })
        .catch(error => {
          console.error('Erro ao registrar Service Worker:', error)
        })
    }
  }, [])

  return null
}
