-- PRACTICE DATA ONLY. Replace with approved salon facts before live use.
insert into public.faqs(id,category,question,answer,enabled) values('11111111-1111-4111-8111-111111111111','hours','営業時間と定休日を教えてください','【練習用】営業時間は10:00〜19:00、定休日は毎週火曜日です。臨時休業は公式LINEのお知らせをご確認ください。',true) on conflict(id) do nothing;
insert into public.faqs(id,category,question,answer,enabled) values('22222222-2222-4222-8222-222222222222','price','カットなどの料金はいくらですか','メニュー欄の税込料金をご案内します。髪の長さなどによる追加料金は、オーナーへご確認ください。',true) on conflict(id) do nothing;
insert into public.faqs(id,category,question,answer,enabled) values('33333333-3333-4333-8333-333333333333','booking','予約はどのようにすればよいですか','ご予約のご相談は、このLINEに希望日時とメニューをお送りください。オーナーからの返信をもって確定します。自動応答では空き状況の確認や予約確定はできません。',true) on conflict(id) do nothing;
insert into public.faqs(id,category,question,answer,enabled) values('44444444-4444-4444-8444-444444444444','combination','パーマとカラーを同じ日にできますか','【練習用】パーマとカラーの同日施術の可否は、髪の状態や施術内容によって異なります。この自動応答では個別の施術可否は判断できません。ご自身の場合については、このLINEに髪の状態とご希望をお送りいただき、オーナーへご相談ください。',true) on conflict(id) do nothing;
insert into public.faqs(id,category,question,answer,enabled) values('55555555-5555-4555-8555-555555555555','parking','駐車場はありますか','【練習用】店舗前に1台分の駐車スペースがあります。ご利用希望は事前にLINEでお知らせください。',true) on conflict(id) do nothing;
insert into public.menus(id,name,price_yen,duration_minutes,notes) values('66666666-6666-4666-8666-666666666666','カット',5500,60,'練習用・シャンプーとブロー込み') on conflict(id) do nothing;
insert into public.menus(id,name,price_yen,duration_minutes,notes) values('77777777-7777-4777-8777-777777777777','カラー',7700,90,'練習用・髪の長さにより追加あり') on conflict(id) do nothing;
insert into public.menus(id,name,price_yen,duration_minutes,notes) values('88888888-8888-4888-8888-888888888888','パーマ',8800,120,'練習用・髪の状態を確認') on conflict(id) do nothing;
