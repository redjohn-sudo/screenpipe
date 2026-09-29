// screenpipe — AI that knows everything you've seen, said, or heard
// https://screenpipe.com
import { Database } from "bun:sqlite";
const [dbPath, outputPath, startIso, durationText] = process.argv.slice(2);
const durationMs = Number(durationText || 12000);
const started = Date.now();
const observations: any[] = [];
let db: Database | null = null;
while (Date.now() - started <= durationMs) {
  try {
    db ??= new Database(dbPath, { readonly: true, strict: false });
    const frames = db.query("select id,timestamp,snapshot_path,capture_trigger,app_name,window_name,browser_url,full_text,accessibility_text,accessibility_tree_json,elements_ref_frame_id from frames where timestamp >= ? order by id").all(startIso);
    const events = db.query("select id,timestamp,event_type,delta_y,frame_id,app_name,window_title,browser_url from ui_events where timestamp >= ? order by id").all(startIso);
    observations.push({ observedUtc: new Date().toISOString(), frames, events });
  } catch (error) {
    observations.push({ observedUtc: new Date().toISOString(), error: String(error) });
    db?.close(); db = null;
  }
  await Bun.sleep(100);
}
db?.close();
await Bun.write(outputPath, JSON.stringify({ dbPath, requestedStartUtc: startIso, durationMs, observations }, null, 2));
