import { useState } from "react"
import { Sparkles, BookOpen, Rocket, ChevronDown } from "lucide-react"

/**
 * Onboarding panel at the bottom of /admin: what changed on the web app, how a new
 * manager uses the new features, and what's coming. Static content, collapsible.
 */
export default function WhatsNew() {
  const [open, setOpen] = useState(true)

  const Section = ({ icon, title, children }) => (
    <div>
      <h3 className="flex items-center gap-2 font-bold text-sm text-slate-900 dark:text-white mb-2">{icon} {title}</h3>
      <ul className="space-y-1.5 text-sm text-slate-600 dark:text-slate-300 leading-relaxed">{children}</ul>
    </div>
  )
  const Li = ({ children }) => (
    <li className="flex gap-2"><span className="text-brand-light shrink-0">•</span><span>{children}</span></li>
  )
  const B = ({ children }) => <span className="font-semibold text-slate-900 dark:text-white">{children}</span>

  return (
    <div className="card overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between gap-3 px-5 py-4 text-right">
        <span className="flex items-center gap-2 font-bold text-slate-900 dark:text-white">
          <Sparkles className="w-5 h-5 text-brand" /> מה חדש בפאנל הניהול — מדריך למנהל
        </span>
        <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="px-5 pb-5 pt-1 border-t border-slate-100 dark:border-slate-700 space-y-6">
          <p className="text-sm text-slate-500 dark:text-slate-400 pt-3">
            האתר עבר שדרוג משמעותי: מאתר תוצאות סטטי — לאפליקציית ליגה חברתית עם חשבונות, פיד עדכונים, ושיפוט משחקים חי. הנה מה שהשתנה ואיך משתמשים בזה.
          </p>

          <Section icon={<Sparkles className="w-4 h-4 text-emerald-500" />} title="מה כבר עובד">
            <Li><B>עמוד בית חברתי (פיד)</B> — עדכונים, פוסטים, לייקים ותגובות במקום דף סטטי.</Li>
            <Li><B>עמודי שחקנים וקבוצות</B> — לכל שחקן וקבוצה עמוד עם סטטיסטיקות, יומן משחקים ותוצאות.</Li>
            <Li><B>חשבונות והרשמה</B> — שחקנים ואוהדים יכולים להירשם ולהתחבר (אימייל או Google).</Li>
            <Li><B>בקשת בעלות על פרופיל</B> — שחקן שמשחק בליגה מבקש לשייך את החשבון שלו לרשומת השחקן שלו; הבקשות מגיעות ללשונית <B>בקשות</B> לאישורך.</Li>
            <Li><B>תפקידים והרשאות</B> — הענקת תפקידים למשתמשים: שחקן / מאמן / עורך תוכן / <B>שופט</B> (לשונית <B>תפקידים</B>).</Li>
            <Li><B>לוח שיפוט חי</B> — שופטים מנהלים משחק בזמן אמת (שעון ספירה לאחור, מחציות והארכה, שערים, כרטיסים עם ספירה, פסקי זמן) — והתוצאה, גיליון המשחק והטבלה מתעדכנים אוטומטית בסיום.</Li>
          </Section>

          <Section icon={<BookOpen className="w-4 h-4 text-blue-500" />} title="איך משתמשים — צעד אחר צעד">
            <Li><B>אישור שחקנים:</B> לשונית <B>בקשות</B> ← ליד כל בקשה יש "אישור". אישור מקשר את החשבון לשחקן ומעניק לו תפקיד שחקן אוטומטית.</Li>
            <Li><B>מינוי שופט:</B> לשונית <B>תפקידים</B> ← בחר משתמש ← "הוסף תפקיד" ← <B>שופט</B> ← הענק. (השופט יראה "שיפוט" בתפריט לאחר התחברות מחדש.)</Li>
            <Li><B>שיפוט משחק:</B> השופט נכנס ל<B>שיפוט</B> בתפריט ← בוחר משחק מתוכנן ← מפעיל את לוח הבקרה (אפשר במסך מלא) ← בסיום לוחץ <B>סיום ושמירת התוצאה</B> ← הכול נשמר.</Li>
            <Li><B>ניהול רגיל:</B> משחקים, שחקנים, קבוצות ומצב עונה — בלשוניות הרגילות, בדיוק כמו קודם.</Li>
          </Section>

          <Section icon={<Rocket className="w-4 h-4 text-purple-500" />} title="מה מתוכנן בהמשך">
            <Li>שיוך שופט למשחק ספציפי — כך שכל שופט יראה רק את המשחקים שהוקצו לו.</Li>
            <Li>צפייה חיה לצופים בזמן משחק, צליל צופר, וערכות עיצוב ללוח.</Li>
            <Li>מדיה ותמונות מהמשחקים ותכונות נוספות בפיד.</Li>
            <Li>האתר ימשיך להתעדכן כך שייראה ויתנהג כמו אפליקציות המובייל (iOS ואנדרואיד).</Li>
          </Section>
        </div>
      )}
    </div>
  )
}
