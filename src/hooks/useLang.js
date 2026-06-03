import { useState, useCallback } from 'react'

export function useLang() {
  const [lang, setLang] = useState(() => localStorage.getItem('sms_lang') || 'en')

  const toggleLang = useCallback(() => {
    setLang(prev => {
      const next = prev === 'en' ? 'ta' : 'en'
      localStorage.setItem('sms_lang', next)
      return next
    })
  }, [])

  return [lang, toggleLang]
}
