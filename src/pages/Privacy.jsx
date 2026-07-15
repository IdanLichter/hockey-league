import { Shield } from "lucide-react"

// Privacy policy for the rinkhockeyIL apps (iOS / Android / web). Linked as the
// App Store / Play privacy URL: https://hockey-league-pro.vercel.app/privacy
export default function Privacy() {
  return (
    <div dir="rtl" className="max-w-3xl mx-auto p-4 sm:p-6 lg:p-8">
      <div className="flex items-center gap-2.5 mb-1">
        <Shield className="w-7 h-7 text-orange-500" />
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">מדיניות פרטיות</h1>
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
        אפליקציית <span className="font-semibold">rinkhockeyIL</span> / ליגת ההוקי · עודכן לאחרונה: 10 ביולי 2026
      </p>

      <div className="card p-5 sm:p-6 space-y-6 text-slate-700 dark:text-slate-200 leading-relaxed text-[15px]">
        <Section title="מי אנחנו">
          rinkhockeyIL היא אפליקציה קהילתית עצמאית לקהילת הוקי גלגליות חובבנית בישראל (אתר, iOS ו‑Android) —
          טבלה, משחקים, סטטיסטיקות, פיד קהילתי וכלי שיפוט. היא אינה משויכת לאף ליגה, פדרציה או ארגון ספורט
          רשמי ואינה מייצגת עצמה ככזו. מדיניות זו מסבירה איזה מידע נאסף וכיצד נעשה בו שימוש.
        </Section>

        <Section title="מידע שאנו אוספים">
          <ul className="list-disc pr-5 space-y-1.5">
            <li><b>חשבון:</b> כתובת דוא״ל ושם תצוגה, שנמסרים על ידך בעת ההרשמה (דרך שירות האימות Supabase Auth).</li>
            <li><b>תוכן שיצרת:</b> פוסטים, תגובות ולייקים שאתה מפרסם בפיד.</li>
            <li><b>נתוני ליגה ציבוריים</b> (קבוצות, שחקנים, משחקים, תמונות) — מידע ציבורי של הליגה, אינו מידע אישי שלך.</li>
            <li>איננו אוספים מיקום, איננו עוקבים אחריך בין אפליקציות, אין פרסומות, ואיננו מוכרים מידע לאף גורם.</li>
          </ul>
        </Section>

        <Section title="כיצד אנו משתמשים במידע">
          המידע משמש אך ורק להפעלת השירות: התחברות לחשבון, פרסום ותגובות בפיד, שיוך שחקן,
          והצגת תוכן הליגה. איננו משתמשים במידע לפרסום או פרופיילינג.
        </Section>

        <Section title="שירותי צד שלישי">
          אנו משתמשים ב‑<b>Supabase</b> לאחסון, אימות ומסד נתונים. הנתונים נשמרים בשרתי Supabase.
          איננו משתפים מידע אישי עם מפרסמים או צדדים שלישיים מסחריים.
        </Section>

        <Section title="מחיקת חשבון ונתונים">
          ניתן למחוק את החשבון וכל הנתונים המשויכים אליו (פוסטים, תגובות, לייקים) ישירות מתוך האפליקציה:
          פתחו את <b>החשבון שלי</b> ובחרו <b>מחיקת חשבון</b>. המחיקה מיידית ובלתי הפיכה. לחלופין ניתן לפנות
          אלינו בדוא״ל ונבצע את המחיקה.
        </Section>

        <Section title="שמירת מידע">
          נתוני החשבון נשמרים כל עוד החשבון פעיל. עם מחיקת החשבון, המידע האישי והתוכן שיצרת נמחקים.
        </Section>

        <Section title="קטינים">
          הליגה כוללת גם שחקני נוער. איננו אוספים במכוון מידע מקטינים מעבר לפרטי ההרשמה הבסיסיים,
          ומומלץ להורים ללוות את השימוש של קטינים באפליקציה.
        </Section>

        <Section title="אבטחה">
          התקשורת מוצפנת ב‑HTTPS וגישה לנתונים מוגנת בכללי הרשאות (Row Level Security) בצד השרת.
        </Section>

        <Section title="יצירת קשר">
          לשאלות או בקשות בנוגע לפרטיות: <a className="text-orange-600 dark:text-orange-400 font-semibold" href="mailto:arielbiton03@gmail.com">arielbiton03@gmail.com</a>
        </Section>

        <hr className="border-slate-200 dark:border-slate-700" />

        <div dir="ltr" className="text-sm text-slate-500 dark:text-slate-400 space-y-2">
          <p className="font-semibold text-slate-700 dark:text-slate-300">Privacy Policy (English summary)</p>
          <p>
            rinkhockeyIL is an independent, community-made app for an amateur roller-hockey community
            in Israel (web, iOS, Android). It is not affiliated with or endorsed by any league,
            federation, or sports organization. We collect only your
            email + display name (for the account, via Supabase Auth) and content you post (posts,
            comments, likes). We do not collect location, do not track you across apps, show no ads,
            and never sell data. Data is stored with Supabase. You can delete your account and all
            associated data at any time from within the app (My Account → Delete Account), or by
            emailing us. Contact: arielbiton03@gmail.com.
          </p>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <section>
      <h2 className="text-base font-bold text-slate-900 dark:text-white mb-2">{title}</h2>
      <div>{children}</div>
    </section>
  )
}
