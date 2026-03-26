-- Allow users to delete their own notifications so the center stays ephemeral
CREATE POLICY "Users can delete own notifications"
  ON public.notifications FOR DELETE TO authenticated
  USING (recipient_user_id = auth.uid());

