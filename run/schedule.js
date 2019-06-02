// this function schedules unscheduled webpagetests
const mongo = require('../utils/mongo');
const fetchApi = require('../utils/fetchApi');
const auth = require('../utils/auth');

const BATCH_SIZE = 20;

async function fetchUpdates(buf, path) {
  console.log(`requesting ${path}: ${buf.length}`);

  // don't wait for response
  fetchApi(path, buf).catch(console.error);
}

async function scheduleWebPageTestRun() {
  const db = await mongo();
  // getting unscheduleded jobs
  const cursor = await db.collection('deployments').find(
    {
      auditing: 'scheduled',
    },
    {
      projection: { id: 1, ownerId: 1, url: 1 },
    }
  );
  let buf = [];
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const doc = await cursor.next();
    if (!doc) break;

    const { ownerId, url, id } = doc;
    buf.push({ ownerId, url, id });

    // eslint-disable-next-line no-continue
    if (buf.length < BATCH_SIZE) continue;

    fetchUpdates(buf, '/run/runWebpageTest.js');
    buf = [];
  }
  if (buf.length) {
    fetchUpdates(buf, '/run/runWebpageTest.js');
  }
}

async function scheduleWebPageTestResults() {
  const db = await mongo();
  // getting unscheduleded jobs
  const cursor = await db.collection('deployments').find(
    {
      auditing: 'running',
    },
    {
      projection: { id: 1, testId: 1, ownerId: 1, url: 1 },
    }
  );
  let buf = [];
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const doc = await cursor.next();
    if (!doc) break;

    const { ownerId, url, id, testId } = doc;
    buf.push({ ownerId, url, id, testId });

    // eslint-disable-next-line no-continue
    if (buf.length < BATCH_SIZE) continue;

    fetchUpdates(buf, '/run/fetchTestResults.js');
    buf = [];
  }
  if (buf.length) {
    fetchUpdates(buf, '/run/fetchTestResults.js');
  }
}

module.exports = mongo.withClose(
  auth(async (req, res) => {
    await Promise.all([scheduleWebPageTestRun(), scheduleWebPageTestResults()]);
    res.end('ok');
  })
);
