# Deploy และดูแลระบบ Admin Portal (production)

คู่มือนี้ใช้สำหรับขึ้นระบบจริงและดูแลประจำวัน ส่วนการพัฒนาในเครื่องดูที่ [README](../README.md)

## 1. เลือกที่รัน

| ตัวเลือก | เหมาะกับ | สิ่งที่ต้องรู้ |
|---|---|---|
| **Vercel Pro** (`sin1`) | ตู้ไม่เกินประมาณ 50 ตู้ ต้องการดูแลน้อย | `/kiosk/wait` เปิด function ค้างไว้ตู้ละประมาณ 25 วินาที คิดค่าใช้จ่ายตามเวลาที่ค้าง, request/response จำกัดที่ 4.5 MB (อัปโหลด overlay ใหญ่และภาพ AI ขนาด 2K อาจเกิน), cron ทุก 5 นาทีต้องใช้แพ็กเกจ Pro |
| **Node server เครื่องเดียว** (VPS/Docker + `next start` หลัง reverse proxy ที่มี TLS) | ตู้จำนวนมาก หรือต้องการคุมค่าใช้จ่าย | ต้องตั้ง scheduler เรียก cron เอง, ให้ proxy เขียนทับ `X-Forwarded-For` (ใช้ทำ rate limit), เพิ่ม `DATABASE_POOL_SIZE` (เช่น 20) |

**ฐานข้อมูล:** MariaDB 10.11 หรือ 11.4 แบบ managed ใน region สิงคโปร์
- เปิด TLS (`DATABASE_SSL=true`)
- `max_connections` อย่างน้อย 200
- เปิด backup รายวัน และ binlog สำหรับกู้คืนย้อนเวลา (PITR)
- ทดสอบกับเวอร์ชันนี้ก่อน (เครื่อง dev ใช้ MariaDB 13)

## 2. Environment variables

| ตัวแปร | จำเป็น | หมายเหตุ |
|---|---|---|
| `DATABASE_URL` | ✅ | `mysql://user:pass@host:3306/db` |
| `DATABASE_SSL` | ✅ (`true`) | ถ้าไม่ใช่ `true` ระบบจะเตือนตอนเริ่ม |
| `MASTER_KEY` | ✅ | 32 bytes แบบ base64 ใช้เข้ารหัสกุญแจ Stripe / R2 / AI ใน DB **เก็บสำเนาไว้ที่ปลอดภัย (ดูข้อ 7)** |
| `ADMIN_PUBLIC_URL` | ✅ | `https://admin.โดเมน` ใช้สร้าง webhook, ลิงก์ asset ของตู้ และลิงก์อัปโหลดจากมือถือ |
| `CRON_SECRET` | ✅ | สตริงสุ่ม ถ้าไม่ตั้ง cron เก็บกวาดจะปิดอยู่ |
| `PLATFORM_R2_ACCOUNT_ID`, `PLATFORM_R2_ENDPOINT`, `PLATFORM_R2_BUCKET`, `PLATFORM_R2_ACCESS_KEY_ID`, `PLATFORM_R2_SECRET_ACCESS_KEY`, `PLATFORM_R2_PUBLIC_URL` | ✅ | bucket ของบริษัทสำหรับไฟล์เทมเพลต (แยกจาก bucket รูปลูกค้า) |
| `DATABASE_POOL_SIZE` | – | ค่าเริ่มต้น 5 ต่อ instance |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_NAME` / `SEED_ADMIN_PASSWORD` | ใช้ครั้งเดียว | **ลบทิ้งหลังรัน seed** |
| `STRIPE_API_BASE_URL`, `AI_*_BASE_URL` | ไม่ต้องตั้ง | ใช้เฉพาะกรณีผ่าน proxy และใน production รับเฉพาะ https |

`instrumentation.ts` ตรวจค่าทุกตัวตอนเริ่ม server ถ้าตัวที่จำเป็นหายไปหรือผิดรูปแบบ ระบบจะ**ไม่ยอมเริ่ม**และบอกใน log ว่าตัวไหนผิด ส่วนเรื่องที่ไม่ร้ายแรงจะขึ้นเป็นคำเตือน

ห้ามใช้ `apps/admin/.env.local` ของเครื่อง dev กับ production เพราะมีรหัสผ่านทดสอบ (`TEST_*`) อยู่

## 3. ขั้นตอน deploy ครั้งแรก

1. สร้างฐานข้อมูลและผู้ใช้ DB ของแอป ให้สิทธิ์เฉพาะฐานข้อมูลนี้
2. ตั้ง env ตามข้อ 2
3. รัน migration จากเครื่องที่ต่อ DB production ได้: `npm run db:migrate`
4. สร้างผู้ดูแลแพลตฟอร์มคนแรก: ตั้ง `SEED_ADMIN_*` แล้วรัน `npm run db:seed` จากนั้น**ลบ `SEED_ADMIN_PASSWORD` ออก**และเปลี่ยนรหัสผ่านหลังเข้าสู่ระบบครั้งแรก
5. Deploy:
   - Vercel: Root Directory `apps/admin`
   - Node: `npm run build` แล้ว `npm start -w @photobooth/admin`
6. ตรวจ `GET /healthz` ต้องได้ `{"ok":true}`
7. ตั้ง cron:
   - Vercel อ่านจาก `vercel.json` อยู่แล้ว (ทุก 5 นาที)
   - Node server: ตั้ง scheduler เรียก `GET https://<admin>/internal/cron/housekeeping` พร้อม header `Authorization: Bearer <CRON_SECRET>` ทุก 5 นาที
8. ตั้ง Stripe (ข้อ 4) และ R2 (ข้อ 5)
9. ทำ pilot กับตู้ 1–2 เครื่องในโหมดทดสอบ ก่อนเปิดรับเงินจริง (ข้อ 8)

## 4. Stripe

- **Endpoint ของบัญชีกลาง:** `https://<admin>/webhooks/stripe`
- **Endpoint ของบัญชีร้าน:** `https://<admin>/webhooks/stripe/<orgId>` ดู URL ได้ในหน้าการรับเงินของร้าน
- **Events ที่ต้องเลือก:** `payment_intent.succeeded`, `payment_intent.canceled`, `payment_intent.payment_failed`
- ตั้ง endpoint แยกของโหมดทดสอบและโหมดจริง แล้วนำ Signing secret ของแต่ละโหมดไปใส่ช่องของโหมดนั้น ระบบไม่ยอมให้ event หรือ secret ของโหมดทดสอบไปเปลี่ยนรายการของโหมดจริง
- **การรับเงินจริง:** ร้านจะรับเงินจริงได้เมื่อแพลตฟอร์มเปิดสิทธิ์ "รับเงินจริง" ให้ร้านนั้น
- **เงินที่จ่ายแล้วแต่ไม่ได้ภาพ AI:** ดูได้ที่หน้า **การรับเงิน** ของร้าน ส่วน "ชำระเงินแล้วแต่ยังไม่ได้รับภาพ AI" ตอนนี้ต้องคืนเงินใน Stripe Dashboard ด้วยรหัส PaymentIntent ที่แสดงไว้ ระบบยังไม่มีปุ่มคืนเงินในตัว

## 5. ที่เก็บไฟล์ (Cloudflare R2)

- **Bucket ของบริษัท (เทมเพลต):** ตั้งผ่าน `PLATFORM_R2_*` และต้องเปิด public URL ให้ตู้ดาวน์โหลดไฟล์ได้
- **Bucket ของร้าน (รูปลูกค้า):** ตั้งในหน้าพื้นที่เก็บภาพของร้าน
  - ต้องเปิด public access เพราะลูกค้าดาวน์โหลดผ่าน QR
  - ตั้ง Lifecycle rule ลบไฟล์ใต้ `p/` ตามจำนวนวันที่ร้านเลือก ระบบไม่ลบไฟล์ให้เอง
- ตอนนี้ทุกตู้ของร้านได้ R2 key ชุดเดียวกัน เมื่อตู้ถูกรีเซ็ตหรือยกเลิกการผูก ตู้จะลบ key ทิ้ง แต่ถ้าเครื่องหายหรือถูกขโมย ให้ **rotate key ของร้านใน Cloudflare** แล้วใส่ key ใหม่ใน Admin

## 6. งานประจำและการเฝ้าระวัง

- **`/healthz`:** ตั้ง uptime monitor ทุก 1 นาที
- **cron housekeeping:** ทุก 5 นาที ทำงานดังนี้
  - เคลียร์งาน AI ที่ค้าง และคืนการชำระเงินที่ถูกกันไว้
  - ยกเลิก QR ที่หมดอายุ
  - เติมค่าธรรมเนียม Stripe ที่ยังขาด
  - ลบรูปที่อัปโหลดจากมือถือซึ่งหมดอายุแล้ว
  - ลบ session หมดอายุ, rate-limit เก่า และคำสั่งตู้ที่เสร็จแล้วเกิน 30 วัน
- **Log:** error ของ API ตู้ขึ้นต้นด้วย `[kiosk-api]` และหน้าที่ error จะแสดง "รหัสอ้างอิง" (digest) ให้ใช้ค้นใน log
- **ตาราง `order_thumbs`, `ai_job_files`:** เก็บรูปในฐานข้อมูล จึงต้องเฝ้าขนาด DB ตอนนี้ thumbnail ยังไม่มีการลบตามอายุ

## 7. Backup และกุญแจ

- **ฐานข้อมูล:** backup รายวันและ PITR ของผู้ให้บริการ ซ้อมกู้คืนลงฐานข้อมูลทดสอบอย่างน้อยไตรมาสละครั้ง
- **`MASTER_KEY`:** เก็บสำเนาใน password manager ขององค์กร ถ้าไม่มี key นี้ backup จะเปิดกุญแจ Stripe / R2 / AI ที่เก็บไว้ไม่ได้
- **การเปลี่ยน `MASTER_KEY`:** ตอนนี้ยังทำไม่ได้ (ยังไม่มีสคริปต์เข้ารหัสใหม่) ถ้า key รั่ว ให้ทำดังนี้:
  1. เปลี่ยนกุญแจที่ปลายทาง (Stripe / Cloudflare / AI) ก่อน
  2. ตั้ง `MASTER_KEY` ใหม่
  3. ใส่กุญแจทุกชุดใหม่ใน Admin

## 8. ก่อนเปิดรับเงินจริง (checklist)

- [ ] `npm run typecheck` และ `npm test` ผ่าน, migration ล่าสุดรันกับ DB production แล้ว
- [ ] `/healthz` ตอบ ok และ cron รันแล้ว (เรียกด้วยมือได้ผล `"ok":true`)
- [ ] ลบ `SEED_ADMIN_PASSWORD` แล้ว และผู้ดูแลแพลตฟอร์มทุกคนใช้รหัสผ่านที่แข็งแรง
- [ ] Stripe โหมดทดสอบ: จ่ายผ่าน QR → ได้ภาพ, ปล่อยให้ QR หมดเวลา, จ่ายในวินาทีสุดท้าย, ทำ AI ล้มเหลวแล้วกด "ลองสร้างภาพอีกครั้ง"
- [ ] ตู้ pilot: ตั้งรหัสเข้าหน้าตั้งค่าใหม่ (Config > การตั้งค่า) หรือตั้งรหัสผู้ดูแลตู้ใน Admin, ปิด "โหมดสาธิตการจ่ายเงิน" และ "โหมดสาธิต AI"
- [ ] ตู้ pilot: ดึงปลั๊กแล้วเปิดใหม่ ตู้ต้องเปิดเอง และยอดขายที่ค้างต้องส่งถึง Admin
- [ ] ตั้ง lifecycle rule ใน R2 ของทุกร้านแล้ว

## 9. Rollback

- Deploy เวอร์ชันก่อนหน้า: Vercel ใช้ "Promote" deployment เดิม, Node ใช้ checkout tag เดิมแล้ว build ใหม่
- ก่อน deploy ให้ตรวจว่า migration ใหม่เป็นแบบเพิ่มเท่านั้น (เพิ่มคอลัมน์หรือตาราง) โค้ดเวอร์ชันเก่าจะได้ยังใช้กับ DB ใหม่ได้ ห้ามย้อน migration เองโดยไม่มีแผน
