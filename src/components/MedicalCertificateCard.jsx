import { useState, useEffect, useRef } from "react"
import { getMyMedical, uploadMedical } from "@/lib/medical"
import { HeartPulse, Upload, Clock, CheckCircle2, XCircle, Loader2 } from "lucide-react"

const STATUS = {
  pending: { label: "ממתין לאישור המאמן", cls: "text-amber-600 dark:text-amber-400", Icon: Clock },
  approved: { label: "אושר", cls: "text-emerald-600 dark:text-emerald-400", Icon: CheckCircle2 },
  rejected: { label: "נדחה — יש להעלות מחדש", cls: "text-red-600 dark:text-red-400", Icon: XCircle },
}

/**
 * The player's medical-certificate card (#2). Uploads a photo/PDF of the yearly
 * physical to the private bucket for coach approval, and shows the current status.
 * Renders for a linked player only.
 */
export default function MedicalCertificateCard({ playerId }) {
  const [cert, setCert] = useState(null)
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState(null)
  const fileRef = useRef(null)

  const load = async () => { setCert(await getMyMedical(playerId)); setLoading(false) }
  useEffect(() => { load() }, [playerId])

  const onFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setError(null)
    try {
      await uploadMedical(playerId, file)
      await load()
    } catch (err) {
      setError(err?.message === "medical-already-pending" ? "כבר יש אישור שממתין לבדיקה" : "ההעלאה נכשלה, נסו שוב")
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  if (loading) return null
  const canUpload = !cert || cert.status === "rejected"
  const st = cert ? STATUS[cert.status] : null

  return (
    <div className="card p-4 space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
        <HeartPulse className="w-4 h-4 text-orange-500" /> אישור רפואי
      </h3>
      <p className="text-[11px] text-slate-400 dark:text-slate-500">
        העלו צילום של הבדיקה הרפואית השנתית לאישור המאמן. הקובץ פרטי — נראה רק לך, למאמן ולמנהל.
      </p>

      {st && (
        <div className={`flex items-center gap-2 text-sm font-semibold ${st.cls}`}>
          <st.Icon className="w-4 h-4" /> {st.label}
        </div>
      )}

      {canUpload && (
        <div>
          <input ref={fileRef} type="file" accept="image/*,application/pdf" onChange={onFile} className="hidden" id="medical-file" />
          <label htmlFor="medical-file"
            className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-2 rounded-lg bg-orange-500 text-white hover:bg-orange-600 transition-colors cursor-pointer">
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            {cert?.status === "rejected" ? "העלאה מחדש" : "העלאת אישור"}
          </label>
        </div>
      )}

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
