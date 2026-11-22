'use client'

import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowLeft, Copy, LoaderCircle, Plus, RefreshCw, Save, ShieldAlert, Ticket, Trash2, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PADDLE_PLANS } from '@/lib/billing/catalog'
import { useT } from '@/lib/i18n'
import { countText } from '@/lib/i18n/count-text'
import { redemptionSaveSteps, validAdminTakeTarget, ADMIN_TAKE_LIMIT } from '@/lib/billing/voucher'

type Voucher = {
  id: string
  code: string
  label: string
  plan: string
  duration_days: number
  max_uses: number
  redemption_count: number
  active: boolean
  deleted_at: string | null
  created_at: string
}

type Redemption = {
  id: string
  voucher_id: string
  workspace_id: string
  user_id: string
  email: string
  name: string
  plan: string
  redeemed_at: string
  expires_at: string
  revoked_at: string | null
  /** 고객 계정 화면과 같은 남은 Take. 계정이 지워진 등록은 null */
  takes: number | null
  status: string
}

type RedemptionForm = { plan: string; endDate: string; takes: number | null }

type AdminData = { vouchers: Voucher[]; redemptions: Redemption[] }

const planLabel = (id: string) => PADDLE_PLANS.find((plan) => plan.id === id)?.name ?? id
const dateOnly = (value: string) => new Date(value).toISOString().slice(0, 10)

export default function AdminPage() {
  const t = useT()
  const [data, setData] = useState<AdminData>({ vouchers: [], redemptions: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [form, setForm] = useState({ label: '', code: '', plan: 's1', durationDays: 30, maxUses: 1 })

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/admin/vouchers', { cache: 'no-store' })
      if (!response.ok) throw new Error(t(response.status === 403 ? 'Admin access is required.' : 'Could not load voucher data.'))
      setData(await response.json())
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Request failed'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => { void load() }, [load])

  const stats = useMemo(() => ({
    total: data.vouchers.filter((item) => !item.deleted_at).length,
    active: data.vouchers.filter((item) => item.active && !item.deleted_at).length,
    users: data.redemptions.filter((item) => !item.revoked_at && Date.parse(item.expires_at) > Date.now()).length,
  }), [data])

  const filteredRedemptions = data.redemptions.filter((item) =>
    `${item.email} ${item.name} ${item.plan}`.toLowerCase().includes(query.toLowerCase()),
  )

  async function createVoucher(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch('/api/admin/vouchers', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(t(body.error === 'code_already_exists' ? 'This voucher code is already in use.' : 'Could not create the voucher.'))
      setNotice(t('Created voucher {code}.', { code: body.voucher.code }))
      setForm({ label: '', code: '', plan: 's1', durationDays: 30, maxUses: 1 })
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Could not create the voucher.'))
    } finally {
      setBusy(false)
    }
  }

  async function updateVoucher(id: string, patch: Record<string, unknown>) {
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`/api/admin/vouchers/${id}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(t(body.error === 'code_already_exists' ? 'This voucher code is already in use.' : 'Could not save the voucher.'))
      setEditing(null)
      setNotice(t('Saved the voucher.'))
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Could not save the voucher.'))
    } finally {
      setBusy(false)
    }
  }

  async function deleteVoucher(voucher: Voucher) {
    if (!window.confirm(t('Delete {code} and end paid access for its current users? They can still view their projects.', { code: voucher.code }))) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`/api/admin/vouchers/${voucher.id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error(t('Could not delete the voucher.'))
      setNotice(t('Deleted the voucher and ended the access linked to it.'))
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Could not delete the voucher.'))
    } finally {
      setBusy(false)
    }
  }

  // 바뀐 칸만 보낸다. 이용 기간(티어·종료일)을 먼저 저장하고 그 뒤에 남은 Take를 정한 수로 맞춘다.
  async function saveRedemption(row: Redemption, form: RedemptionForm) {
    const steps = redemptionSaveSteps({ plan: row.plan, endDate: dateOnly(row.expires_at), takes: row.takes }, form)
    if (!steps.access && steps.takes === null) return
    if (steps.takes !== null && !window.confirm(t('Change Takes for {email} from {from} to {to}?', { email: row.email, from: row.takes ?? 0, to: steps.takes }))) return
    setBusy(true)
    setError('')
    try {
      if (steps.access) {
        const response = await fetch(`/api/admin/vouchers/redemptions/${row.id}`, {
          method: 'PATCH', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ plan: form.plan, expiresAt: new Date(`${form.endDate}T23:59:59.999Z`).toISOString() }),
        })
        if (!response.ok) throw new Error(t('Could not save the account access.'))
      }
      if (steps.takes !== null) {
        const response = await fetch(`/api/admin/vouchers/redemptions/${row.id}/takes`, {
          method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ takes: steps.takes }),
        })
        if (!response.ok) throw new Error(t('Could not change the Takes.'))
      }
      setNotice(steps.access ? t('Saved access for {email}.', { email: row.email }) : t('Changed Takes for {email} to {n}.', { email: row.email, n: steps.takes ?? 0 }))
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Could not save the account access.'))
    } finally {
      setBusy(false)
    }
  }

  async function revokeRedemption(row: Redemption) {
    if (!window.confirm(t('End paid access for {email}? They can still view their projects.', { email: row.email }))) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch(`/api/admin/vouchers/redemptions/${row.id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error(t('Could not end the account access.'))
      // 구독 중인 고객은 해지해도 구독 요금제가 남는다. "무료로 전환"이라고 알리지 않는다.
      setNotice(t('Ended voucher access for {email}.', { email: row.email }))
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('Could not end the account access.'))
    } finally {
      setBusy(false)
    }
  }

  async function copyCode(code: string) {
    await navigator.clipboard.writeText(code)
    setNotice(t('Copied {code}.', { code }))
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl space-y-8 px-5 py-8 md:px-8">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border-subtle pb-6">
          <div>
            <Link href="/projects" className="mb-3 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="size-4" /> {t('Back to projects')}
            </Link>
            <h1 className="text-2xl font-semibold tracking-tight">{t('Voucher management')}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t('Manage customer codes, the accounts using them, and paid access.')}</p>
          </div>
          <Button variant="outline" onClick={() => void load()} disabled={loading || busy}>
            <RefreshCw className="mr-2 size-4" /> {t('Refresh')}
          </Button>
        </header>

        {(error || notice) && (
          <div role={error ? 'alert' : 'status'} className={`rounded-md border px-4 py-3 text-sm ${error ? 'border-destructive/50 text-destructive' : 'border-border text-foreground'}`}>
            {error || notice}
          </div>
        )}

        {error === t('Admin access is required.') && <p className="text-sm text-muted-foreground">{t('Sign in with an admin account and open this page again.')}</p>}

        <section className="grid gap-3 sm:grid-cols-3" aria-label={t('Voucher overview')}>
          {[
            { label: t('All vouchers'), value: stats.total, icon: Ticket },
            { label: t('Redeemable vouchers'), value: stats.active, icon: ShieldAlert },
            { label: t('Accounts using a voucher'), value: stats.users, icon: Users },
          ].map(({ label, value, icon: Icon }) => (
            <div key={label} className="rounded-lg border border-border bg-card p-5">
              <div className="flex items-center justify-between text-sm text-muted-foreground"><span>{label}</span><Icon className="size-4" /></div>
              <p className="mt-3 font-mono text-2xl">{loading ? '—' : value}</p>
            </div>
          ))}
        </section>

        <section className="space-y-4 rounded-lg border border-border bg-card p-5">
          <div>
            <h2 className="font-semibold">{t('Create a voucher')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t('Leave the code empty to generate one. By default a voucher lasts 1 month from redemption and works for 1 account.')}</p>
          </div>
          <form onSubmit={createVoucher} className="grid gap-3 md:grid-cols-6">
            <label className="space-y-1 text-sm md:col-span-2">{t('Name')}
              <input required maxLength={120} value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2" placeholder={t('For example, Partner trial')} />
            </label>
            <label className="space-y-1 text-sm md:col-span-2">{t('Code (optional)')}
              <input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2 font-mono uppercase" placeholder={t('Generated automatically')} />
            </label>
            <label className="space-y-1 text-sm">{t('Plan')}
              <select value={form.plan} onChange={(event) => setForm({ ...form, plan: event.target.value })} className="w-full rounded-md border border-input bg-background px-3 py-2">
                {PADDLE_PLANS.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-sm">{t('Duration (days)')}
              <input type="number" min={1} max={3650} value={form.durationDays} onChange={(event) => setForm({ ...form, durationDays: Number(event.target.value) })} className="w-full rounded-md border border-input bg-background px-3 py-2" />
            </label>
            <label className="space-y-1 text-sm">{t('Accounts allowed')}
              <input type="number" min={1} max={100000} value={form.maxUses} onChange={(event) => setForm({ ...form, maxUses: Number(event.target.value) })} className="w-full rounded-md border border-input bg-background px-3 py-2" />
            </label>
            <div className="flex items-end md:col-span-5"><Button type="submit" disabled={busy}><Plus className="mr-2 size-4" />{t('Create voucher')}</Button></div>
          </form>
        </section>

        <section className="space-y-3">
          <div className="flex items-end justify-between gap-4">
            <div><h2 className="text-lg font-semibold">{t('Issued vouchers')}</h2><p className="text-sm text-muted-foreground">{t('Tier and duration changes apply to customers who redeem from now on. Adjust existing accounts below. Pausing blocks new redemptions, and deleting also ends paid access in use.')}</p></div>
          </div>
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="border-b border-border-subtle text-muted-foreground"><tr><th className="px-4 py-3">{t('Code / Name')}</th><th className="px-4 py-3">{t('Plan')}</th><th className="px-4 py-3">{t('Period')}</th><th className="px-4 py-3">{t('Redemptions')}</th><th className="px-4 py-3">{t('Status')}</th><th className="px-4 py-3">{t('Manage')}</th></tr></thead>
              <tbody>
                {data.vouchers.filter((item) => !item.deleted_at).map((voucher) => (
                  <VoucherRow key={`${voucher.id}-${voucher.label}-${voucher.plan}-${voucher.duration_days}-${voucher.max_uses}`} voucher={voucher} editing={editing === voucher.id} busy={busy} onEdit={() => setEditing(editing === voucher.id ? null : voucher.id)} onSave={(patch) => void updateVoucher(voucher.id, patch)} onToggle={() => void updateVoucher(voucher.id, { active: !voucher.active })} onDelete={() => void deleteVoucher(voucher)} onCopy={() => void copyCode(voucher.code)} />
                ))}
                {!loading && data.vouchers.filter((item) => !item.deleted_at).length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">{t('No vouchers issued yet.')}</td></tr>}
                {loading && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground"><LoaderCircle className="mr-2 inline size-4 animate-spin" />{t('Loading…')}</td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><h2 className="text-lg font-semibold">{t('Customers who redeemed')}</h2><p className="text-sm text-muted-foreground">{t('Adjust the tier, end date, and remaining Takes for each account, or end paid access.')}</p></div>
            <input value={query} onChange={(event) => setQuery(event.target.value)} aria-label={t('Search customers')} placeholder={t('Search by email or name')} className="w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm" />
          </div>
          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full min-w-[1100px] text-left text-sm">
              <thead className="border-b border-border-subtle text-muted-foreground"><tr><th className="px-4 py-3">{t('Account')}</th><th className="px-4 py-3">{t('Voucher')}</th><th className="px-4 py-3">{t('Tier')}</th><th className="px-4 py-3">{t('Redeemed on')}</th><th className="px-4 py-3">{t('Access ends')}</th><th className="px-4 py-3">{t('Takes')}</th><th className="px-4 py-3">{t('Status')}</th><th className="px-4 py-3">{t('Manage')}</th></tr></thead>
              <tbody>
                {filteredRedemptions.map((row) => <RedemptionRow key={`${row.id}-${row.plan}-${row.expires_at}-${row.revoked_at}-${row.takes}`} row={row} voucher={data.vouchers.find((item) => item.id === row.voucher_id)} busy={busy} onSave={(form) => void saveRedemption(row, form)} onRevoke={() => void revokeRedemption(row)} />)}
                {!loading && filteredRedemptions.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">{t('No customers have redeemed a voucher yet.')}</td></tr>}
                {loading && <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground"><LoaderCircle className="mr-2 inline size-4 animate-spin" />{t('Loading…')}</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  )
}

function VoucherRow({ voucher, editing, busy, onEdit, onSave, onToggle, onDelete, onCopy }: {
  voucher: Voucher; editing: boolean; busy: boolean; onEdit: () => void
  onSave: (patch: Record<string, unknown>) => void; onToggle: () => void; onDelete: () => void; onCopy: () => void
}) {
  const t = useT()
  const [form, setForm] = useState({ label: voucher.label, plan: voucher.plan, durationDays: voucher.duration_days, maxUses: voucher.max_uses })
  const complete = voucher.redemption_count >= voucher.max_uses
  return <>
    <tr className="border-b border-border-subtle last:border-0">
      <td className="px-4 py-3"><div className="flex items-center gap-2 font-mono"><span>{voucher.code}</span><button onClick={onCopy} aria-label={t('Copy code')} className="text-muted-foreground hover:text-foreground"><Copy className="size-3.5" /></button></div><p className="mt-1 font-sans text-xs text-muted-foreground">{voucher.label}</p></td>
      <td className="px-4 py-3">{planLabel(voucher.plan)}</td><td className="px-4 py-3">{countText(t, voucher.duration_days, '1 day', '{n} days', { n: voucher.duration_days })}</td>
      <td className="px-4 py-3 font-mono">{voucher.redemption_count} / {voucher.max_uses}</td>
      <td className="px-4 py-3"><span className={voucher.active && !complete ? 'text-success' : 'text-muted-foreground'}>{voucher.active && !complete ? t('Redeemable') : voucher.active ? t('Limit reached') : t('Paused')}</span></td>
      <td className="px-4 py-3"><div className="flex items-center gap-2"><Button size="sm" variant="outline" onClick={onEdit}>{t('Edit')}</Button><Button size="sm" variant="outline" onClick={onToggle} disabled={busy}>{voucher.active ? t('Pause') : t('Resume redemptions')}</Button><Button size="icon" variant="ghost" onClick={onDelete} disabled={busy} aria-label={t('Delete voucher')}><Trash2 className="size-4" /></Button></div></td>
    </tr>
    {editing && <tr className="border-b border-border"><td colSpan={6} className="bg-muted/30 p-4"><div className="grid gap-3 md:grid-cols-6">
      <label className="space-y-1 text-xs">{t('Name')}<input value={form.label} onChange={(event) => setForm({ ...form, label: event.target.value })} className="w-full rounded border border-input bg-background px-2 py-2 text-sm" /></label>
      <label className="space-y-1 text-xs">{t('Plan')}<select value={form.plan} onChange={(event) => setForm({ ...form, plan: event.target.value })} className="w-full rounded border border-input bg-background px-2 py-2 text-sm">{PADDLE_PLANS.map((plan) => <option key={plan.id} value={plan.id}>{plan.name}</option>)}</select></label>
      <label className="space-y-1 text-xs">{t('Duration (days)')}<input type="number" min={1} max={3650} value={form.durationDays} onChange={(event) => setForm({ ...form, durationDays: Number(event.target.value) })} className="w-full rounded border border-input bg-background px-2 py-2 text-sm" /></label>
      <label className="space-y-1 text-xs">{t('Max redemptions')}<input type="number" min={1} max={100000} value={form.maxUses} onChange={(event) => setForm({ ...form, maxUses: Number(event.target.value) })} className="w-full rounded border border-input bg-background px-2 py-2 text-sm" /></label>
      <div className="flex items-end"><Button size="sm" onClick={() => onSave(form)} disabled={busy}><Save className="mr-2 size-3.5" />{t('Save')}</Button></div>
    </div></td></tr>}
  </>
}

function RedemptionRow({ row, voucher, busy, onSave, onRevoke }: {
  row: Redemption; voucher?: Voucher; busy: boolean; onSave: (form: RedemptionForm) => void; onRevoke: () => void
}) {
  const t = useT()
  const [plan, setPlan] = useState(row.plan)
  const [expiry, setExpiry] = useState(dateOnly(row.expires_at))
  const [takesText, setTakesText] = useState(row.takes === null ? '' : String(row.takes))
  const takes = takesText.trim() === '' ? null : Number(takesText)
  const takesValid = takes === null || validAdminTakeTarget(takes)
  const steps = redemptionSaveSteps({ plan: row.plan, endDate: dateOnly(row.expires_at), takes: row.takes }, { plan, endDate: expiry, takes: takesValid ? takes : null })
  const changed = steps.access || steps.takes !== null
  const status = row.status === 'expired' ? t('Expired') : row.status === 'revoked' ? t('Revoked') : t('In use')
  return <tr className="border-b border-border-subtle last:border-0">
    <td className="px-4 py-3"><span>{row.name || '—'}</span><p className="mt-1 text-xs text-muted-foreground">{row.email}</p></td>
    <td className="px-4 py-3 font-mono">{voucher?.code ?? '—'}</td>
    <td className="px-4 py-3"><select value={plan} onChange={(event) => setPlan(event.target.value)} className="rounded border border-input bg-background px-2 py-1">{PADDLE_PLANS.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></td>
    <td className="px-4 py-3">{new Date(row.redeemed_at).toLocaleDateString('ko-KR')}</td>
    <td className="px-4 py-3"><input type="date" value={expiry} onChange={(event) => setExpiry(event.target.value)} className="rounded border border-input bg-background px-2 py-1" /></td>
    <td className="px-4 py-3"><input type="number" min={0} max={ADMIN_TAKE_LIMIT} step={1} inputMode="numeric" value={takesText} disabled={row.takes === null} onChange={(event) => setTakesText(event.target.value)} aria-label={t('Remaining Takes for {email}', { email: row.email })} aria-invalid={!takesValid} className="w-24 rounded border border-input bg-background px-2 py-1 font-mono tabular-nums aria-[invalid=true]:border-destructive" /></td>
    <td className="px-4 py-3 text-muted-foreground">{status}</td>
    <td className="px-4 py-3"><div className="flex gap-2"><Button size="sm" variant="outline" disabled={busy || !expiry || !takesValid || !changed} onClick={() => onSave({ plan, endDate: expiry, takes })}>{t('Save')}</Button><Button size="sm" variant="ghost" disabled={busy || !!row.revoked_at} onClick={onRevoke}>{t('End access')}</Button></div></td>
  </tr>
}
