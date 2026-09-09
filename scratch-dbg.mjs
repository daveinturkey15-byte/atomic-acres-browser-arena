import { launchSoloMatch } from './scripts/qa/lib/launch-match.mjs';
try {
  const t = await launchSoloMatch({ arena: 'test1', seed: 5 });
  console.log('launched ok');
  await t.browser.close();
} catch (e) { console.log('ERR', String(e).slice(0, 400)); }
