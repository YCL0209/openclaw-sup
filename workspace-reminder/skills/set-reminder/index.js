/**
 * Set Reminder Skill
 *
 * 接收 system-router 傳入的 params，把提醒寫進 MongoDB reminders collection。
 * 用法：node index.js --userId <id> --content <text> --remindAt <ISO date>
 * 輸出：JSON
 */

const path = require('path');
const MONGO_LIB = process.env.MONGO_LIB_PATH || '/Users/liaoyacheng/.openclaw/lib/mongodb-tools';
const mongo = require(MONGO_LIB);

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true;
      args[key] = val;
      if (val !== true) i++;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const userId = args.userId || null;
  const content = args.content || '';
  const remindAt = args.remindAt ? new Date(args.remindAt) : null;

  if (!content) {
    console.log(JSON.stringify({ ok: false, error: '缺少提醒內容' }));
    process.exit(1);
  }

  const db = await mongo.getDb();

  const doc = {
    userId,
    content,
    remindAt,
    status: 'pending',
    createdAt: new Date(),
    deliveredAt: null
  };

  const result = await db.collection('reminders').insertOne(doc);

  const output = {
    ok: true,
    action: 'result',
    data: {
      summary: remindAt
        ? `✅ 已設定提醒：「${content}」\n⏰ 提醒時間：${remindAt.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' })}`
        : `✅ 已設定提醒：「${content}」\n⏰ 提醒時間：未指定`,
      reminderId: result.insertedId.toString()
    }
  };

  console.log(JSON.stringify(output, null, 2));
  await mongo.close();
}

main().catch(err => {
  console.log(JSON.stringify({ ok: false, error: err.message }));
  process.exit(1);
});
