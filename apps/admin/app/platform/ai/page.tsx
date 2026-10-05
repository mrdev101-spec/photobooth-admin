import type { Metadata } from 'next';
import Link from 'next/link';
import { Activity, KeyRound, Sparkles } from 'lucide-react';
import { requirePlatform } from '@/server/auth/context';
import { canPlatform } from '@/server/auth/rbac';
import { aiSettingsSummary } from '@/server/services/ai-settings';
import { allAiUsage, currentMonth, recentAiJobs } from '@/server/services/ai-jobs';
import { AI_PROVIDERS, AI_PROVIDER_IDS, THAI_TEXT_MODELS, type AiProvider } from '@/server/ai/engine';
import { SCENE_PROMPTS } from '@/server/ai/scene-prompts';
import { ActionForm, FormField, SubmitButton } from '@/components/form';
import { Badge, Card, EmptyState, Input, Notice, PageHeader, Select, Table, Td, Th } from '@/components/ui';
import { AiUsageBadge, AiUsageBar, aiUsageLevel } from '@/components/ai-usage';
import { formatDateTime } from '@/lib/format';
import { saveAiSettingsAction, testAiSettingsAction } from './actions';

export const metadata: Metadata = { title: 'ตั้งค่า AI' };

const PROVIDER_CHOICES = [
  { id: 'auto', label: 'อัตโนมัติ (OpenAI → OpenRouter → Google ตัวแรกที่มี key)' },
  ...AI_PROVIDER_IDS.map((p) => ({ id: p, label: AI_PROVIDERS[p].label }))
];

const KEY_HINTS: Record<AiProvider, string> = { openai: 'sk-… / sk-proj-…', openrouter: 'sk-or-…', google: 'AIza…' };

const JOB_STATUS: Record<string, { label: string; tone: 'success' | 'danger' | 'info' | 'neutral' }> = {
  succeeded: { label: 'สำเร็จ', tone: 'success' },
  failed: { label: 'ไม่สำเร็จ', tone: 'danger' },
  running: { label: 'กำลังสร้าง', tone: 'info' },
  queued: { label: 'รอคิว', tone: 'neutral' }
};

export default async function PlatformAiPage() {
  const { user } = await requirePlatform();
  const canManage = canPlatform(user.platformRole, 'platform.secrets');
  const [s, usage, jobs] = await Promise.all([aiSettingsSummary(), allAiUsage(), recentAiJobs(null, 30)]);
  const month = currentMonth();
  const attention = usage.filter((u) => aiUsageLevel(u.used ?? 0, u.quota) !== 'ok');

  return (
    <div className="flex flex-col gap-5 pb-6">
      <PageHeader
        title="ตั้งค่า AI"
        description="คีย์ AI กลางของแพลตฟอร์มสำหรับทุกร้าน ตู้ส่งรูปมาสร้างภาพที่นี่ คีย์ไม่ถูกส่งไปที่ตู้ และนับโควตาของแต่ละร้านที่นี่"
      />

      {!s.configured ? (
        <Notice tone="warn" title="AI ยังไม่พร้อม">
          ยังไม่มี API Key ตู้ทุกเครื่องจะแสดงว่าโหมด AI ปิดให้บริการชั่วคราว
        </Notice>
      ) : null}
      {attention.length ? (
        <Notice tone={attention.some((u) => aiUsageLevel(u.used ?? 0, u.quota) === 'full') ? 'danger' : 'warn'} title="ร้านที่ใช้ AI ใกล้ครบหรือครบโควตาเดือนนี้">
          {attention.map((u) => `${u.name} (${u.used ?? 0}/${u.quota})`).join(' • ')} — เพิ่มโควตาได้ที่หน้าร้าน › ขีดจำกัดและสิทธิ์
        </Notice>
      ) : null}

      <Card
        title="บัญชี AI ของแพลตฟอร์ม"
        subtitle="key เก็บแบบเข้ารหัส แสดงเฉพาะ 4 ตัวท้าย เว้นช่องว่างไว้ = ใช้ key เดิม"
        icon={<KeyRound aria-hidden />}
        actions={
          s.configured ? (
            s.lastTestOk ? <Badge tone="success" dot>ทดสอบผ่าน</Badge> : s.lastTestOk === false ? <Badge tone="danger" dot>ทดสอบไม่ผ่าน</Badge> : <Badge dot>ยังไม่ทดสอบ</Badge>
          ) : (
            <Badge tone="warning" dot>ยังไม่ตั้ง</Badge>
          )
        }
      >
        <ActionForm action={saveAiSettingsAction} className="flex flex-col gap-5">
          <fieldset disabled={!canManage} className="grid gap-5 sm:grid-cols-2">
            <FormField label="ผู้ให้บริการที่ใช้" name="provider" hint={s.activeProvider ? `ตอนนี้ใช้ ${AI_PROVIDERS[s.activeProvider].label} • ${s.activeModel}` : 'ยังไม่มี key'}>
              <Select id="provider" name="provider" defaultValue={s.providerSetting}>
                {PROVIDER_CHOICES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="ขนาดภาพ" name="imageSize" hint="2K คมกว่าแต่ช้าและแพงกว่า">
              <Select id="imageSize" name="imageSize" defaultValue={s.imageSize}>
                <option value="1K">1K (แนะนำ)</option>
                <option value="2K">2K</option>
              </Select>
            </FormField>

            {AI_PROVIDER_IDS.map((p) => (
              <div key={p} className="grid gap-3 rounded-lg border border-ink-200 p-4 sm:col-span-2 sm:grid-cols-2">
                <div className="flex items-center gap-2 sm:col-span-2">
                  <span className="font-semibold text-ink-900">{AI_PROVIDERS[p].label}</span>
                  {s.keys[p].set ? <Badge tone="success">key …{s.keys[p].hint}</Badge> : <Badge>ไม่มี key</Badge>}
                </div>
                <FormField label="API Key" name={`${p}Key`} hint={s.keys[p].set ? 'เว้นว่าง = ใช้ key เดิม' : KEY_HINTS[p]}>
                  <Input id={`${p}Key`} name={`${p}Key`} type="password" autoComplete="new-password" placeholder={s.keys[p].set ? `…${s.keys[p].hint}` : KEY_HINTS[p]} />
                </FormField>
                <FormField label="โมเดล" name={`${p}Model`}>
                  <Select id={`${p}Model`} name={`${p}Model`} defaultValue={s.models[p]}>
                    {Object.entries(AI_PROVIDERS[p].models).map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </FormField>
                {s.keys[p].set ? (
                  <label className="flex items-center gap-2 text-sm text-ink-600 sm:col-span-2">
                    <input type="checkbox" name="clearKeys" value={p} className="size-4 accent-danger-600" /> ลบ key ของ {AI_PROVIDERS[p].label}
                  </label>
                ) : null}
              </div>
            ))}

            <FormField
              label="โมเดลสำหรับฉากที่มีตัวอักษรไทย"
              name="thaiTextModel"
              hint={s.thaiTextRoute ? `ใช้ผ่าน ${AI_PROVIDERS[s.thaiTextRoute].label}` : 'ต้องมี key ของ OpenAI หรือ OpenRouter ไม่เช่นนั้นใช้โมเดลปกติ'}
            >
              <Select id="thaiTextModel" name="thaiTextModel" defaultValue={s.thaiTextModel}>
                {Object.entries(THAI_TEXT_MODELS).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </Select>
            </FormField>
            <label className="flex items-start gap-3 rounded-lg border border-ink-200 p-4">
              <input type="checkbox" name="faceRefine" defaultChecked={s.faceRefine} className="mt-1 size-5 accent-primary-600" />
              <span>
                <span className="font-semibold text-ink-900">ปรับใบหน้าให้เหมือนรอบสอง</span>
                <span className="block text-sm text-ink-500">หน้าเหมือนลูกค้ามากขึ้น แต่ใช้เวลาและค่าใช้จ่ายเป็น 2 เท่า</span>
              </span>
            </label>
          </fieldset>
          {canManage ? (
            <div>
              <SubmitButton>บันทึก</SubmitButton>
            </div>
          ) : null}
        </ActionForm>

        {s.configured && canManage ? (
          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-ink-200 pt-4">
            <ActionForm action={testAiSettingsAction}>
              <SubmitButton variant="outline" size="sm" pendingLabel="กำลังทดสอบ…">
                ทดสอบการเชื่อมต่อ (ไม่เสียเครดิต)
              </SubmitButton>
            </ActionForm>
            <span className="text-sm text-ink-500">{s.lastTestAt ? `ทดสอบล่าสุด ${formatDateTime(s.lastTestAt)} — ${s.lastTestMessage ?? ''}` : 'ยังไม่เคยทดสอบ'}</span>
          </div>
        ) : null}
      </Card>

      <Card flush title={`การใช้ AI เดือนนี้ (${month})`} subtitle="นับเฉพาะภาพที่ลูกค้าได้รับจริง ครั้งที่ล้มเหลวไม่นับ ครบโควตาแล้วโหมด AI ของร้านนั้นปิดจนถึงเดือนถัดไป" icon={<Sparkles aria-hidden />}>
        {usage.length ? (
          <Table bare>
            <thead>
              <tr>
                <Th>ร้าน</Th>
                <Th className="w-72">ใช้ไป / โควตา</Th>
                <Th className="text-right">ไม่สำเร็จ</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {usage.map((u) => (
                <tr key={u.orgId}>
                  <Td>
                    <Link href={`/platform/organizations/${u.orgId}/limits`} className="font-medium text-ink-900 hover:underline">
                      {u.name}
                    </Link>
                  </Td>
                  <Td>
                    <AiUsageBar used={u.used ?? 0} quota={u.quota} />
                  </Td>
                  <Td className="text-right tabular-nums">{u.failed ?? 0}</Td>
                  <Td className="text-right">
                    <AiUsageBadge used={u.used ?? 0} quota={u.quota} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="ยังไม่มีร้าน" />
        )}
      </Card>

      <Card flush title="งาน AI ล่าสุด" subtitle="ไม่มีการเก็บรูปลูกค้า รูปถูกลบทันทีที่สร้างเสร็จ ภาพผลลัพธ์ลบหลัง 1 ชั่วโมง" icon={<Activity aria-hidden />}>
        {jobs.length ? (
          <Table bare>
            <thead>
              <tr>
                <Th>เวลา</Th>
                <Th>ร้าน</Th>
                <Th>ฉาก</Th>
                <Th>สถานะ</Th>
                <Th>โมเดล</Th>
                <Th className="text-right">เวลาที่ใช้</Th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id}>
                  <Td className="whitespace-nowrap tabular-nums">{formatDateTime(j.createdAt)}</Td>
                  <Td>{j.orgName}</Td>
                  <Td>{SCENE_PROMPTS[j.sceneId]?.title ?? j.sceneId}</Td>
                  <Td>
                    <Badge tone={JOB_STATUS[j.status]?.tone ?? 'neutral'}>{JOB_STATUS[j.status]?.label ?? j.status}</Badge>
                    {j.errorCode ? <span className="mt-1 block max-w-72 truncate text-xs text-danger-600" title={j.errorDetail ?? ''}>[{j.errorCode}] {j.errorDetail}</span> : null}
                  </Td>
                  <Td className="text-sm text-ink-600">{j.model ? `${j.model}${j.refined ? ' • ปรับหน้า' : ''}` : '—'}</Td>
                  <Td className="text-right tabular-nums">{j.durationMs != null ? `${(j.durationMs / 1000).toFixed(1)} วิ` : '—'}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState title="ยังไม่มีงาน AI" />
        )}
      </Card>
    </div>
  );
}
