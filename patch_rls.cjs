const { execSync } = require('child_process');
const fs = require('fs');

const sql = `
-- Drop existing policies
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON "public"."match_winner_votes";
DROP POLICY IF EXISTS "Enable update for users based on user_id" ON "public"."match_winner_votes";
DROP POLICY IF EXISTS "Enable read access for all users" ON "public"."match_winner_votes";

-- Allow anyone to read
CREATE POLICY "Enable read access for all users" ON "public"."match_winner_votes" FOR SELECT USING (true);

-- Allow authenticated users to insert/update their own votes
CREATE POLICY "Enable insert for authenticated users only" ON "public"."match_winner_votes" FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Enable update for users based on user_id" ON "public"."match_winner_votes" FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Also allow delete if needed
CREATE POLICY "Enable delete for users based on user_id" ON "public"."match_winner_votes" FOR DELETE TO authenticated USING (auth.uid() = user_id);
`;

fs.writeFileSync('supabase_patch_rls.sql', sql);
console.log('SQL patch created.');
