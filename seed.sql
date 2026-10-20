insert into public.events (
  id, slug, title, subtitle, summary, description, category, location, address,
  start_at, end_at, registration_start_at, registration_deadline, capacity, status, registration_methods,
  hero_image_url, poster_image_url, contact_name, contact_phone, contact_address, is_featured
) values
(
  '8ee9a384-b87d-4f1c-a58d-a00d7f6fe001',
  'ocean-sustainability-week',
  '海洋永續週：我們與海的未來',
  '從生活選擇開始，與海洋建立更長久的關係',
  '結合專題分享、互動展覽與行動倡議，一起認識海洋保育與永續生活。',
  '透過專題演講、互動分享與行動倡議，邀請不同年齡的參加者認識海洋議題，探索日常生活中可以實踐的永續行動。活動同時設有小型展覽與交流環節，讓參加者把知識轉化為可持續的生活選擇。',
  '講座', '城市圖書館 10 樓國際會議廳', '香港九龍文化道 88 號',
  '2026-10-17 14:00:00+08', '2026-10-17 17:00:00+08', '2026-09-01 09:00:00+08', '2026-10-15 23:59:00+08',
  120, 'published', array['online','in_person']::public.registration_method[],
  '/images/hero-community.jpg', '/images/ocean-poster.jpg', '活動服務處', '2345 6789', '社區中心地下服務櫃台', true
),
(
  '8ee9a384-b87d-4f1c-a58d-a00d7f6fe002',
  'design-thinking-workshop', '設計思考工作坊', '用創意方法解決真實社區問題',
  '以小組方式體驗同理、定義、創意發想、原型及測試五個步驟。',
  '工作坊以社區生活中的真實需要作為題材，參加者會透過訪談、觀察、快速原型與回饋，學習如何把模糊問題整理成可實踐的方案。',
  '工作坊', '創意中心 2 樓多用途室', '香港九龍啟德協調道 12 號',
  '2026-10-24 10:00:00+08', '2026-10-24 16:00:00+08', '2026-09-15 09:00:00+08', '2026-10-21 23:59:00+08',
  30, 'published', array['online']::public.registration_method[],
  '/images/design-poster.jpg', '/images/design-poster.jpg', '課程統籌', '2345 6801', null, true
),
(
  '8ee9a384-b87d-4f1c-a58d-a00d7f6fe003',
  'forest-healing-day', '山林療癒日', '放慢腳步，重新感受身體與自然',
  '由導師帶領森林漫步、呼吸練習與靜觀體驗，適合初次參與人士。',
  '一天的戶外體驗包括低強度山徑步行、感官覺察、呼吸放鬆及自然創作。活動重點並非速度或體能挑戰，而是讓參加者在安全而有節奏的環境中休息、交流。',
  '戶外活動', '大埔自然教育徑集合處', '新界大埔大美督道',
  '2026-11-01 09:00:00+08', '2026-11-01 17:00:00+08', '2026-08-01 09:00:00+08', '2026-10-28 23:59:00+08',
  40, 'published', array['online','in_person']::public.registration_method[],
  '/images/forest-poster.jpg', '/images/forest-poster.jpg', '戶外活動組', '2345 6812', '社區中心一樓詢問處', true
)
on conflict (id) do nothing;


insert into public.event_site_settings (
  setting_key, hero_title, hero_description, hero_image_url, hero_image_alt
) values (
  'homepage',
  E'連結人與活動\n創造更多可能',
  '發掘精彩活動、學習新知、參與社群。從活動海報到電子入場證，讓每一次參與都更簡單。',
  '/images/hero-community.jpg',
  '明亮的社區活動空間'
)
on conflict (setting_key) do nothing;
