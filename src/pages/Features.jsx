import { Globe, Smartphone, UserCircle, Users, Trophy, PenLine, Crown, Wrench, MessageSquareText, Star } from "lucide-react"
import { Player, Whistle } from "@/components/icons/HockeyIcons"

/**
 * Public feature guide (/guide) — "what can you do in the system", organised by
 * role and tagged per platform (web / mobile app). Doubles as a testing &
 * feedback drive: it invites users to report anything that's broken or could be
 * better, and lists what we already know isn't finished yet.
 *
 * Pure content page — no data fetching. Uses the app's design tokens so it
 * inherits light/dark theming and RTL automatically.
 */

// web/app flags per feature; `note` is an optional caveat shown under the title.
const TIERS = [
  {
    num: "01", label: "פתוח לכולם — ללא הרשמה",
    roles: [{
      id: "everyone", Icon: Globe, title: "כל הגולשים",
      who: "אין צורך בחשבון. כל מי שנכנס לאתר או פותח את האפליקציה יכול לצפות בכל אלה.",
      feats: [
        { t: "המגרש — עמוד הבית (פיד)", d: "פוסטים, תמונות, כרטיסי תוצאות משחק ואינדיקציית מנצחת", web: true, app: true },
        { t: "טבלת הליגה + בית חצי הגמר (Final Four)", d: "דירוג הקבוצות, נקודות, ומבנה הפלייאוף", web: true, app: true },
        { t: "לוח המשחקים", d: 'משחקים קרובים ותוצאות עבר, כולל באנר "משחק חי עכשיו"', web: true, app: true },
        { t: "עמוד משחק חי", d: 'לוח תוצאות עם שעון רץ, "מהלך המשחק" (שערים וכרטיסים בזמן אמת), סטטיסטיקות וגרפים', web: true, app: true },
        { t: "צפייה בשידור וידאו חי", d: "שידור חי של המשחק — צפייה בלבד", web: true, app: true },
        { t: "סטטיסטיקות הליגה", d: "מלך השערים, מובילי הליגה וגרפים", web: true, app: true },
        { t: "קבוצות", d: "רשימת הקבוצות + עמוד קבוצה עם סגל, סמל ופרטים", web: true, app: true },
        { t: "שחקנים", d: "רשימת השחקנים + עמוד שחקן עם סטטיסטיקות וכרטיס אישי", web: true, app: true },
        { t: "טורנירים (נוער)", d: "לוח משחקים, טבלה ושלבים לקטגוריות U19/U17/U15", note: "באפליקציה: מוצג בית חצי הגמר; צפייה מלאה בטורנירים באתר", web: true, app: false },
        { t: "מדיה — אלבומי תמונות", d: "גלריית תמונות מהמשחקים עם זיהוי שחקנים אוטומטי", web: true, app: true },
        { t: "ארכיון עונות קודמות", d: "תוצאות וטבלאות של עונות שהסתיימו", web: true, app: true },
        { t: "תצוגה מקדימה של קישורים", d: "קישור לשחקן/קבוצה/משחק נפתח יפה ב-WhatsApp ובפייסבוק", web: true, app: false },
        { t: "עברית מלאה + מצב כהה", d: "כל הממשק בעברית, כולל תצוגה כהה", web: true, app: true },
      ],
    }],
  },
  {
    num: "02", label: "משתמשים רשומים",
    roles: [
      {
        id: "member", Icon: UserCircle, title: "משתמש רשום",
        who: "נרשמים בחינם עם אימייל, Google או Apple. ההרשמה פותחת את הפעולות החברתיות וההתראות.",
        feats: [
          { t: "הרשמה והתחברות", d: "אימייל וסיסמה, Google, ו-Apple", note: "התחברות עם Apple — ב-iPhone בלבד", web: true, app: true },
          { t: "לייקים, תגובות ותגובות רגש", d: "אינטראקציה עם פוסטים בפיד ועם כרטיסי משחק", web: true, app: true },
          { t: "כתיבת פוסטים בפיד", d: "שיתוף טקסט ותמונות במגרש", web: true, app: true },
          { t: "פעמון התראות", d: "עדכונים על תוצאות, לייקים, תגובות, אישורים ועוד", web: true, app: true },
          { t: "התראות Push למכשיר", d: "מקבלים התראה גם כשהאתר או האפליקציה סגורים", web: true, app: true },
          { t: "מי מחובר עכשיו", d: 'מונה נוכחות חי — "מתגלגלים עכשיו", עם פילוח מחשב/נייד', web: true, app: true },
          { t: "הדף שלי — פרופיל אישי", d: "תמונת פרופיל, מצב כהה, ושינוי סיסמה", note: 'באפליקציה: מסך "החשבון שלי"', web: true, app: true },
          { t: "צ'אט אישי לחברי הליגה", d: "הודעות פרטיות (DM) בין חברי הליגה", web: true, app: false },
          { t: "שכחתי סיסמה / איפוס במייל", d: "קישור איפוס נשלח לאימייל", web: true, app: false },
          { t: "דיווח על תוכן וחסימת משתמשים", d: "דיווח על פוסט לא ראוי; חסימת משתמש מוצגת באתר", web: true, app: true },
        ],
      },
      {
        id: "player", Icon: Player, title: "שחקן",
        who: 'אחרי שמשייכים את החשבון לכרטיס שחקן — דרך "הדף שלי", באישור מנהל או מאמן.',
        feats: [
          { t: "שיוך חשבון לכרטיס שחקן", d: "מחברים את המשתמש לפרופיל השחקן שלכם בליגה", web: true, app: true },
          { t: "הדף האישי כשחקן", d: "הסטטיסטיקות שלכם ויומן המשחקים האישי", web: true, app: true },
          { t: "הגשת זמינות למשחק", d: 'סימון "מגיע / לא מגיע" למשחקים הקרובים', web: true, app: true },
          { t: "אישור רפואי", d: "העלאת תמונה של אישור בריאות שנתי + מעקב תוקף", web: true, app: true },
          { t: "הגשת כרטיס שחקן חדש", d: "למי שעדיין אין כרטיס — מגישים לאישור המאמן", web: true, app: true },
          { t: "התראות ופעולות מהירות אישיות", d: "תזכורת על משחק שלא אישרתם, ועל אישור רפואי שפג או עומד לפוג", web: true, app: false },
          { t: "שיוך למספר קבוצות לפי גיל", d: "חברות בקבוצה אחת בכל קטגוריית גיל", web: true, app: false },
        ],
      },
    ],
  },
  {
    num: "03", label: "צוות מקצועי — במגרש",
    roles: [
      {
        id: "coach", Icon: Users, title: "מאמן",
        who: "תפקיד המוענק לקבוצה ספציפית — מבקשים דרך עמוד הקבוצה, ומנהל מאשר.",
        feats: [
          { t: "מסך ניהול (מוגבל לקבוצה שלכם)", d: "מרכז הניהול, מסונן לקבוצות שאתם מאמנים", web: true, app: true },
          { t: "ניהול סגל הקבוצה", d: "הוספה ועריכה של שחקנים בקבוצה", web: true, app: true },
          { t: "עריכת סטטיסטיקות משחק", d: "עדכון תוצאה, שערים וכרטיסים למשחק", note: "עורך הסטטיסטיקות המפורט זמין באתר", web: true, app: false },
          { t: "אישור בקשות של הקבוצה", d: "שיוך שחקנים, כרטיסי שחקן והצטרפות לקבוצה שלכם", web: true, app: true },
          { t: "אישור אישורים רפואיים", d: "אישור/דחייה של אישורי הבריאות של שחקני הקבוצה", web: true, app: true },
          { t: "עריכת פרטי הקבוצה והסמל", d: "שם, עיר, מגרש בית, צבע וסמל (crest) הקבוצה", web: true, app: false },
          { t: "בקשת שינוי מועד משחק", d: "בקשה שעוברת לאישור מנהל הליגה", web: true, app: false },
        ],
      },
      {
        id: "official", Icon: Whistle, title: "שופט & חובש (בעלי תפקיד במשחק)",
        who: "שופטים מפעילים את מנוע המשחק החי. חובשים ובעלי תפקיד משובצים למשחקים.",
        feats: [
          { t: "מנוע המשחק החי (שיפוט)", d: "שעון ספירה לאחור, שערים, עבירות, כרטיסים, עונשין, פסקי זמן וצפירה", web: true, app: true },
          { t: "שידור חי של מהלך המשחק", d: "התוצאה והשעון משודרים לכל הצופים בזמן אמת", web: true, app: true },
          { t: "בחירת משחק לשיפוט", d: "בחירת משחק מרשימת השיבוצים + לוח תוצאות במסך מלא לרוחב", web: true, app: true },
          { t: "שעון שופט על Apple Watch", d: "סקורבורד ואימון שיפוט על השעון", note: "iPhone / Apple Watch בלבד", app: true },
          { t: "מועמדות עצמית לשיבוץ במשחק", d: "הצעת מועמדות כשופט/חובש ישירות מעמוד המשחק", web: true, app: false },
          { t: "שידור וידאו חי מהמצלמה", d: "פתיחת שידור וידאו של המשחק — מהאתר (באפליקציה: צפייה בלבד)", web: true, app: false },
        ],
      },
    ],
  },
  {
    num: "04", label: "ניהול המערכת",
    roles: [
      {
        id: "lm", Icon: Trophy, title: "מנהל ליגה",
        who: "גישת ניהול-על לכל הליגה (מלבד הרשאות מנהל־מערכת המלאות).",
        feats: [
          { t: "ניהול טורנירים", d: "יצירה, הזמנת קבוצות, מחולל לוח משחקים וטבלאות", web: true, app: false },
          { t: "ניהול כל הקבוצות", d: "יצירה, עריכה ומחיקה של קבוצות בליגה", web: true, app: true },
          { t: "אישור בקשות שינוי משחקים", d: "אישור/דחייה של בקשות מאמנים — האישור מחיל את השינוי אוטומטית", web: true, app: false },
          { t: "מעקב רפואי לכל הליגה", d: "מצב אישורי הבריאות של כל השחקנים", web: true, app: true },
          { t: "שיבוץ בעלי תפקיד", d: "שיבוץ שופטים וחובשים למשחקים", web: true, app: false },
          { t: "ניהול מגרשים", d: "רשימת האולמות והמגרשים בליגה", web: true, app: false },
        ],
      },
      {
        id: "editor", Icon: PenLine, title: "עורך תוכן",
        who: "תפקיד לניהול המדיה, התמונות והתוכן בפיד.",
        feats: [
          { t: "אזור יוצרי תוכן", d: "מרכז ייעודי לניהול תמונות ותוכן", web: true, app: false },
          { t: "זיהוי שחקנים בתמונות", d: "שיוך פנים לשחקנים וניהול קבוצות תמונות", web: true, app: false },
          { t: "טיפול בדיווחי תוכן", d: "מודרציה של פוסטים ותגובות שדווחו", web: true, app: false },
          { t: "הגשת אלבומים חדשים", d: "שליחת אלבום Google Photos לעיבוד וזיהוי", web: true, app: false },
        ],
      },
      {
        id: "admin", Icon: Crown, title: "מנהל מערכת",
        who: "גישה מלאה לכל כלי הניהול במערכת.",
        feats: [
          { t: "כל טאבי הניהול", d: "משחקים, שחקנים, קבוצות, טורנירים, עונה, בקשות, מעקב רפואי, בעלי תפקיד, מגרשים, דיווחים, קבוצות תמונות, תפקידים ומנהלים", web: true, app: true },
          { t: "ניהול תפקידים", d: "הענקה ושלילה של שחקן, מאמן, שופט, חובש, עורך תוכן ומנהל ליגה", web: true, app: true },
          { t: "ניהול מנהלים ומחיקת חשבונות", d: "הוספה/הסרה של מנהלים; מחיקת חשבון משתמש", web: true, app: true },
          { t: "מחולל פוסטרים למשחקים", d: "יצירת פוסטר גרפי לכל משחק", web: true, app: false },
          { t: "מחולל לוח משחקים לטורנירים", d: "יצירה אוטומטית של סבב משחקים", web: true, app: false },
          { t: "ארכוב עונה ואיפוס לעונה חדשה", d: "סגירת עונה, שמירתה בארכיון ופתיחת עונה חדשה", web: true, app: false },
          { t: "מודרציה ודיווחים", d: "טיפול בכל התוכן שדווח במערכת", web: true, app: true },
        ],
      },
    ],
  },
]

const WIP = [
  { t: "שידור וידאו חי", d: "פתיחת שידור מהמצלמה — מהאתר בלבד. באפליקציה יש צפייה בלבד." },
  { t: "טורנירים באפליקציה", d: "צפייה מלאה בטורנירים כרגע באתר; באפליקציה מוצג בית חצי הגמר." },
  { t: "צ'אט אישי", d: "זמין באתר בלבד, עדיין לא באפליקציה." },
  { t: "כלי תוכן ופוסטרים", d: "אזור יוצרי התוכן ומחולל הפוסטרים — באתר בלבד." },
  { t: "ניהול מתקדם באפליקציה", d: "חלק מהכלים המפורטים (עריכת סטטיסטיקות מפורטת, יצירת טורנירים, מחיקת משתמש) עדיין רק באתר." },
  { t: "שעון המשחק החי", d: "לעיתים צריך לרענן את העמוד כדי לראות את הזמן המעודכן — מנגנון הסנכרון בשיפור." },
  { t: "בקשות שינוי משחק", d: "בתהליך שדרוג — בחירת כמה מועדים ואישור של שני הצדדים." },
  { t: "סמלי קבוצות באפליקציה", d: "יעודכנו בגרסה הקרובה של האפליקציה." },
]

function Platform({ web, app }) {
  return (
    <div className="flex flex-wrap gap-1.5 pt-0.5">
      {web && (
        <span className="stat-pill badge-info">
          <Globe className="w-3 h-3" /> אתר
        </span>
      )}
      {app && (
        <span className="stat-pill badge-neutral">
          <Smartphone className="w-3 h-3" /> אפליקציה
        </span>
      )}
    </div>
  )
}

function Feat({ t, d, note, web, app }) {
  return (
    <li className="flex flex-col sm:flex-row sm:items-start gap-2 sm:gap-3 py-3 border-t border-line-subtle first:border-t-0">
      <div className="flex items-start gap-3 flex-1 min-w-0">
        <span className="mt-2 w-1.5 h-1.5 rounded-full bg-brand shrink-0" aria-hidden="true" />
        <div className="min-w-0">
          <div className="font-bold text-fg-strong text-[15px]">{t}</div>
          <div className="text-sm text-fg-soft mt-0.5">{d}</div>
          {note && <div className="text-xs font-semibold text-brand-strong dark:text-brand-light mt-1">{note}</div>}
        </div>
      </div>
      <div className="ps-[18px] sm:ps-0 sm:shrink-0">
        <Platform web={web} app={app} />
      </div>
    </li>
  )
}

function RoleCard({ id, Icon, title, who, feats }) {
  return (
    <section id={id} className="card overflow-hidden mb-4 scroll-mt-20">
      <header className="flex items-start gap-3.5 p-5 pb-4">
        <span className="w-11 h-11 shrink-0 rounded-xl grid place-items-center bg-brand/10 text-brand-strong dark:text-brand-light">
          <Icon className="w-6 h-6" />
        </span>
        <div>
          <h3 className="text-xl font-black tracking-tight text-fg-strong">{title}</h3>
          <p className="text-sm text-fg-muted mt-0.5">{who}</p>
        </div>
      </header>
      <ul className="list-none m-0 px-5 pb-4">
        {feats.map((f) => <Feat key={f.t} {...f} />)}
      </ul>
    </section>
  )
}

export default function Features() {
  return (
    <div dir="rtl" className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
      {/* Header — navy brand band */}
      <div className="relative overflow-hidden rounded-3xl p-6 sm:p-8 mb-6 text-white bg-gradient-to-bl from-[#12295a] to-[#0B1B3A] border border-amber-400/30">
        <div className="absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r from-transparent via-amber-300/70 to-transparent" />
        <div className="text-[13px] font-extrabold tracking-widest text-amber-300 mb-2">מדריך תכונות · עונת 2025-26</div>
        <h1 className="text-3xl sm:text-4xl font-black tracking-tight text-balance leading-tight">מה אפשר לעשות במערכת</h1>
        <p className="mt-2.5 text-[15px] text-slate-200 max-w-2xl leading-relaxed">
          כל מה שהמערכת מציעה — מסודר לפי סוג המשתמש ולפי הפלטפורמה. השתמשו בזה כדי לדעת בדיוק מה אפשר לנסות, ואיפה.
          אם משהו לא עובד, מבלבל, או שנראה לכם שאפשר לשפר — ספרו לנו. גם המדריך הזה בשבילנו.
        </p>
        <div className="flex flex-wrap gap-x-5 gap-y-2 items-center mt-5 pt-4 border-t border-white/15 text-sm text-slate-200">
          <span className="flex items-center gap-2">
            <span className="stat-pill bg-white/10 text-sky-200"><Globe className="w-3 h-3" /> אתר</span>
            = אתר האינטרנט (מחשב או נייד)
          </span>
          <span className="flex items-center gap-2">
            <span className="stat-pill bg-white/10 text-slate-100"><Smartphone className="w-3 h-3" /> אפליקציה</span>
            = אפליקציית iPhone / אנדרואיד
          </span>
        </div>
      </div>

      {/* Jump nav */}
      <nav aria-label="קפיצה לפי תפקיד" className="flex flex-wrap gap-2 mb-6">
        {TIERS.flatMap((tier) => tier.roles).map((r) => (
          <a
            key={r.id}
            href={`#${r.id}`}
            className="text-sm font-bold text-fg-soft bg-surface border border-line rounded-full px-3.5 py-1.5 shadow-sm hover:border-brand hover:-translate-y-px transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            {r.title}
          </a>
        ))}
      </nav>

      {/* Tiers */}
      {TIERS.map((tier) => (
        <div key={tier.num}>
          <div className="flex items-center gap-3.5 mt-8 mb-4">
            <span className="text-xs font-extrabold tracking-widest text-brand-strong dark:text-brand-light">{tier.num}</span>
            <h2 className="text-base font-extrabold text-fg-muted whitespace-nowrap">{tier.label}</h2>
            <span className="flex-1 h-px bg-line" />
          </div>
          {tier.roles.map((r) => <RoleCard key={r.id} {...r} />)}
        </div>
      ))}

      {/* Known / in progress */}
      <div className="flex items-center gap-3.5 mt-8 mb-4">
        <span className="text-xs font-extrabold tracking-widest text-brand-strong dark:text-brand-light">05</span>
        <h2 className="text-base font-extrabold text-fg-muted whitespace-nowrap">בעבודה — ידוע לנו</h2>
        <span className="flex-1 h-px bg-line" />
      </div>
      <div className="card p-5 sm:p-6 mb-4">
        <h4 className="flex items-center gap-2 text-lg font-extrabold text-fg-strong mb-2">
          <Wrench className="w-5 h-5 text-brand" /> תכונות שעדיין לא הושלמו במלואן
        </h4>
        <p className="text-sm text-fg-muted mb-4">
          אלה דברים שאנחנו כבר מודעים אליהם ועובדים עליהם — אין צורך לדווח עליהם שוב. אם נתקלתם בבעיה מעבר לאלה, נשמח שתספרו.
        </p>
        <ul className="list-none m-0 p-0">
          {WIP.map((w) => (
            <li key={w.t} className="flex items-start gap-3 py-3 border-t border-line-subtle first:border-t-0">
              <span className="stat-pill badge-warning shrink-0 mt-0.5">בפיתוח</span>
              <div className="text-sm text-fg-soft">
                <b className="text-fg-strong font-bold">{w.t}:</b> {w.d}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {/* How to test + feedback */}
      <div className="flex items-center gap-3.5 mt-8 mb-4">
        <span className="text-xs font-extrabold tracking-widest text-brand-strong dark:text-brand-light">06</span>
        <h2 className="text-base font-extrabold text-fg-muted whitespace-nowrap">איך לבדוק ואיך לתת פידבק</h2>
        <span className="flex-1 h-px bg-line" />
      </div>

      <div className="card p-5 sm:p-6 mb-4">
        <h4 className="flex items-center gap-2 text-lg font-extrabold text-fg-strong mb-3">
          <Star className="w-5 h-5 text-brand" /> טיפים לבדיקה
        </h4>
        <ol className="list-decimal pr-5 space-y-2 text-fg-soft text-[15px]">
          <li><b className="text-fg-strong">מתחילים בלי חשבון</b> — כנסו לאתר או לאפליקציה ועברו על כל מה שב"פתוח לכולם".</li>
          <li><b className="text-fg-strong">נרשמים</b> (אימייל / Google / Apple) כדי לבדוק לייקים, תגובות, פוסטים והתראות.</li>
          <li><b className="text-fg-strong">רוצים לבדוק תפקיד?</b> בקשו ממנהל המערכת להעניק לכם תפקיד (שחקן / מאמן / שופט וכו') — הוא נכנס לתוקף מיד.</li>
          <li><b className="text-fg-strong">מריצים משחק חי</b> — כשופט, פתחו "שיפוט", בחרו משחק והפעילו את השעון; פתחו את עמוד המשחק במכשיר אחר כדי לראות את השידור החי.</li>
          <li><b className="text-fg-strong">בודקים את שתי הפלטפורמות</b> — חלק מהתכונות זהות באתר ובאפליקציה, וחלק ייחודיות לאתר. שימו לב לתגית שליד כל תכונה.</li>
        </ol>
      </div>

      <div className="card p-5 sm:p-6 mb-4">
        <h4 className="flex items-center gap-2 text-lg font-extrabold text-fg-strong mb-2">
          <MessageSquareText className="w-5 h-5 text-brand" /> מצאתם באג, רעיון, או שמשהו יכול לעבוד טוב יותר?
        </h4>
        <p className="text-sm text-fg-muted mb-3">
          אנחנו רוצים לשמוע הכל — לא רק תקלות. אם משהו לא עובד, מרגיש מבלבל, או שנראה לכם שאפשר לשפר אותו — זה בדיוק מה שאנחנו מחפשים.
        </p>
        <ul className="list-disc pr-5 space-y-2 text-fg-soft text-[15px]">
          <li>רשמו מה עשיתם, מה קרה ומה ציפיתם שיקרה — ואם אפשר, צרפו צילום מסך.</li>
          <li>ציינו את הפלטפורמה: <b className="text-fg-strong">אתר</b> (מחשב/דפדפן) או <b className="text-fg-strong">אפליקציה</b> (iPhone / אנדרואיד), ואת הגרסה.</li>
          <li>שלחו למנהל הליגה כדי שנוכל לתקן במהירות.</li>
        </ul>
      </div>

      <p className="text-center text-sm text-fg-muted mt-8 mb-2 leading-relaxed">
        המערכת מתעדכנת כל הזמן — לעיתים תכונה חדשה מופיעה קודם באתר ורק אחר כך באפליקציה.
        <br />
        אם משהו לא מופיע אצלכם באפליקציה, ודאו שהיא מעודכנת לגרסה האחרונה.
      </p>
    </div>
  )
}
