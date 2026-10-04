-- IS_CONNECTED_TO_USER_FIX.sql

CREATE OR REPLACE FUNCTION public.is_connected_to_user(target_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.friendships 
    WHERE (requester_id = auth.uid() AND addressee_id = target_id) 
       OR (addressee_id = auth.uid() AND requester_id = target_id)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

REVOKE ALL ON FUNCTION public.is_connected_to_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_connected_to_user(uuid) TO authenticated;
