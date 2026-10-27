DO $$
DECLARE
  m record; cid uuid; nxt int;
BEGIN
  CREATE TEMP TABLE _map(ord int, cat text, rx text) ON COMMIT DROP;
  INSERT INTO _map VALUES
  (1,'Codex API','codex'),(2,'AI API','api (deepseek|minimax|qwen)'),(3,'MiniMax','minimax'),
  (4,'YouTube Premium','youtube'),(5,'Canva','^canva'),(6,'ChatGPT','chatgpt|gpt pro'),
  (7,'Notion','notion'),(8,'Wispr','wispr'),(9,'Railway','railway'),(10,'Lovable','lovable'),
  (11,'Gemini AI','gemini|google ai|google flow|veo|antigravity'),(12,'Amazon Prime','amazon prime'),
  (13,'NORD VPN','nord ?vpn'),(14,'Duolingo','duolingo'),(15,'ElevenLabs','eleven ?reader'),
  (16,'Capcut','capcut'),(17,'Higgsfield','higg'),(18,'Discord','server boost'),(19,'Microsoft','office 365'),
  (20,'X Premium','x premium'),(21,'Adobe','adobe'),(22,'Autodesk','autodesk'),
  (23,'VPN','hma|express vpn|surfshark|proton|kaspersky'),(24,'Freepik','freepik'),(25,'Kling','kling'),
  (26,'Leonardo AI','leonardo'),(27,'HeyGen','heygen'),(28,'Seedance','seedance'),
  (29,'Meitu & Wink','meitu|wink|xingtu'),(30,'iCloud & Apple','icloud|apple id'),(31,'Warp','warp'),
  (32,'Framer','framer'),(33,'Mobbin','mobbin'),(34,'Jam','jam'),(35,'Gumloop','gumloop'),
  (36,'Supercut','supercut'),(37,'Udemy','udemy'),(38,'iLovePDF','ilovepdf'),(39,'Resend','resend'),
  (40,'Zoom','zoom'),(41,'Claude','claude'),(42,'Akool','akool'),(43,'Krea','krea'),
  (44,'GPM Login','gpm'),(45,'Social Accounts','tiktok|reddit|telegram account|gmail'),
  (46,'Linear','linear'),(47,'Bolt.new','bolt'),(48,'Descript','descript'),(49,'PostHog','posthog'),
  (50,'Magic Patterns','magic patterns'),(51,'Pangram','pangram'),(52,'Others','.');

  SELECT coalesce(max(sort_order),0)+1 INTO nxt FROM public.categories;

  FOR m IN SELECT * FROM _map ORDER BY ord LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.products p
      WHERE p.category_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM public.product_categories pc WHERE pc.product_id=p.id)
        AND lower(trim(p.name)) ~ m.rx) THEN CONTINUE; END IF;

    SELECT id INTO cid FROM public.categories WHERE lower(trim(name))=lower(m.cat) ORDER BY sort_order LIMIT 1;
    IF cid IS NULL THEN
      INSERT INTO public.categories(name, channel, is_active, sort_order)
      VALUES (m.cat,'both',true,nxt) RETURNING id INTO cid;
      nxt := nxt+1;
    END IF;

    WITH t AS (
      UPDATE public.products p SET category_id=cid
      WHERE p.category_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM public.product_categories pc WHERE pc.product_id=p.id)
        AND lower(trim(p.name)) ~ m.rx
      RETURNING p.id)
    INSERT INTO public.product_categories(product_id, category_id)
    SELECT id, cid FROM t ON CONFLICT DO NOTHING;
    cid := NULL;
  END LOOP;
END $$;