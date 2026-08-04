# 首頁橫額管理更新

本版本新增獨立的首頁橫額設定，不再需要透過活動資料修改首頁頂部內容。

## 管理員操作

登入後台後，按「首頁橫額設定」，可修改：

- 首頁主標題（支援換行）
- 說明文字
- 橫額圖片（可直接上載或輸入圖片網址）
- 圖片替代文字

儲存後只會更新首頁頂部，不會修改任何活動。

## Supabase

已部署舊版本需執行：

```text
supabase/migrations/202608040002_add_homepage_hero_settings.sql
```

此 Migration 使用本系統專用的 `public.event_site_settings`，避免與同一 Supabase Project 內其他網站的 `site_settings` 表發生衝突。
