# 參加者名單管理功能更新

本版本以「首頁橫額設定」版本為基準，恢復管理員直接管理參加者名單的功能。

## 新增功能

- 在每個活動的「報名名單」頁面手動新增參加者
- 修改姓名、電郵、電話、報名方式、報名狀態及備註
- 手動設定或清除出席時間
- 永久刪除參加者紀錄
- 新增時可選擇發送確認電郵及 QR Code
- 已確認、候補及取消狀態可由管理員調整
- 滿額時阻止新增或轉為「已確認」
- 同一活動的有效報名不可使用重複電郵
- 新增、狀態修改及刪除均會自動同步活動 `confirmed_count`

## 資料庫

本次不需要新增資料表或欄位，沿用現有：

- `public.events`
- `public.registrations`
- `public.sync_confirmed_count()` trigger

因此現有 Supabase Project 不需額外執行 Migration。

## 主要新增檔案

- `components/admin-registration-manager.tsx`
- `app/api/admin/events/[id]/registrations/route.ts`
- `app/api/admin/events/[id]/registrations/[registrationId]/route.ts`
- `lib/registration-admin.ts`

## 部署

直接將專案推送至現有 GitHub repository，再由 Vercel 重新部署即可。
