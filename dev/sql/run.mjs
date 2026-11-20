import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import fs from 'fs';
const db = new PGlite({ extensions: { pgcrypto } });
const R = new URL('../../supabase/', import.meta.url).pathname;
await db.exec(fs.readFileSync(new URL('stub.sql', import.meta.url),'utf8'));
for (const f of ['001_schema','002_effort_key','003_view_activity','004_feeds_media','005_companions','006_follows','007_race_env','009_multisport_kinds','010_social','011_security']) {
  try { await db.exec(fs.readFileSync(R+f+'.sql','utf8')); console.log('applied', f); } catch (e) { console.log('FAIL', f, e.message); process.exit(1); }
}
// re-apply 010 to check it's rerunnable
for (const f of ['010_social','011_security']) await db.exec(fs.readFileSync(R+f+'.sql','utf8')); console.log('010+011 rerun ok');
const test = process.argv[2]; if (test) { const t = await import(new URL(test, import.meta.url)); await t.default(db); }
