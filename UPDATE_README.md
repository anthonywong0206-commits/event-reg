# event-reg Vercel / 外部連結活動修正版

日期：2026-09-09

## 今次修正

1. 修正新增／編輯外部連結活動時，前端把 Vercel 純文字錯誤當 JSON 解析而出現：
   `Unexpected token 'R', "Request En"... is not valid JSON`
2. 圖片上載改為：
   - Vercel API 只接收檔案 metadata（檔名 / MIME type / 大小）
   - API 驗證管理員後，向 Supabase 產生短期 signed upload token
   - 瀏覽器直接把圖片傳到 Supabase Storage
   - 圖片本體不再經 Vercel Function request body，因此避開 Request Entity Too Large
3. 保留 8MB 上限，與現有 Supabase `event-media` bucket 設定一致。
4. 新增安全 API response parser：即使 Vercel / proxy 回傳純文字或 HTML，前端會顯示可理解的錯誤，不再直接出現 JSON SyntaxError。
5. `EventRecord` 補齊並固定 external registration 欄位，避免 Vercel TypeScript build 再次出現：
   `Property 'external_registration' does not exist on type 'EventRecord'.`
6. 把 external registration migration 放回 `supabase/migrations/` 正確位置，方便日後 clone / migration history 保持一致。

## 需要覆蓋／新增的檔案

把本 ZIP 內以下檔案，按相同路徑覆蓋到你的 GitHub repository：

- `components/admin-event-form.tsx`（覆蓋）
- `app/api/admin/upload/route.ts`（覆蓋）
- `lib/types.ts`（覆蓋）
- `lib/api-response.ts`（新增）
- `supabase/migrations/202609090001_add_external_registration.sql`（新增到 migrations 目錄）

## Supabase

我已檢查目前連接的正式 Supabase：
- `events.external_registration` 已存在
- `events.external_registration_url` 已存在
- `events.external_registration_organization` 已存在
- `event-media` bucket 已存在、public=true
- bucket 上限 = 8MB
- MIME types = image/jpeg, image/png, image/webp

因此目前正式資料庫 **不用再次執行 SQL**。migration 檔主要用來令 GitHub source / 未來新環境一致。

如果你在另一個 Supabase project 部署，才需要正常套用 migration。

## GitHub / Vercel 更新方式

1. 在 GitHub repository `event-reg` 覆蓋／新增上述 5 個檔案。
2. Commit 到 `main`。
3. Vercel Git Integration 會自動重新部署。
4. Deployment 完成後，測試：
   - 管理員登入
   - 新增活動
   - 勾選「使用外部連結報名」
   - 填入負責機構及 https:// 外部報名網址
   - 如需要，上載 JPG / PNG / WebP（<= 8MB）
   - 儲存活動
5. 前台打開活動，確認會顯示外部報名按鈕及離站提示。

## 注意

- 不要把 Supabase service-role key 放到任何 `NEXT_PUBLIC_` 變數或前端檔案。
- 新流程仍然由 server-side `/api/admin/upload` 驗證管理員後才簽發短期上載 token。
- `vercel.json` 目前設定正確，不需要更改。
