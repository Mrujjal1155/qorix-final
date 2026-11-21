CREATE OR REPLACE FUNCTION public.live_update_enqueue(_kind text, _ref text, _payload jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 INSERT INTO public.live_update_events(kind,ref,payload,general_enabled,status)
 VALUES(_kind,_ref,_payload,_kind IN ('topup','payment') OR (_kind='purchase' AND _payload->>'source'='website'),CASE WHEN _kind='payment' THEN 'awaiting_sender' ELSE 'pending' END)
 ON CONFLICT(ref) DO NOTHING;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
REVOKE ALL ON FUNCTION public.live_update_enqueue(text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.live_update_enqueue(text,text,jsonb) TO service_role;