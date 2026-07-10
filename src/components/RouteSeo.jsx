import { useLocation } from 'react-router-dom'
import { useSeo, NOINDEX_PREFIXES } from '@/lib/seo'

// Per-route metadata for the static pages. Detail pages (/players/:id, /teams/:id)
// call useSeo() themselves with the entity's name; because this component renders
// before <Routes>, their effect runs after this one and wins.
const ROUTES = {
  '/': { title: 'המגרש', description: 'עדכונים, תוצאות ורגעים מליגת הרולר הוקי הישראלית' },
  '/standings': { title: 'טבלת הליגה', description: 'טבלת הדירוג המלאה של ליגת הרולר הוקי הישראלית' },
  '/games': { title: 'משחקים', description: 'לוח המשחקים והתוצאות של ליגת הרולר הוקי' },
  '/statistics': { title: 'סטטיסטיקות', description: 'מלכי השערים, כרטיסים ושערים נקיים בליגת הרולר הוקי' },
  '/teams': { title: 'קבוצות', description: 'כל הקבוצות בליגת הרולר הוקי הישראלית' },
  '/players': { title: 'שחקנים', description: 'כל השחקנים בליגת הרולר הוקי הישראלית' },
  '/media': { title: 'מדיה', description: 'תמונות ורגעים מהמשחקים' },
  '/final-four': { title: 'פיינל פור', description: 'שלב הפיינל פור של ליגת הרולר הוקי' },
  '/archive': { title: 'ארכיון', description: 'עונות קודמות של ליגת הרולר הוקי הישראלית' },
  '/privacy': { title: 'מדיניות פרטיות' },
}

export default function RouteSeo() {
  const { pathname } = useLocation()
  const noindex = NOINDEX_PREFIXES.some(p => pathname === p || pathname.startsWith(`${p}/`))
  const meta = ROUTES[pathname] || {}
  useSeo({ ...meta, path: pathname, noindex })
  return null
}
