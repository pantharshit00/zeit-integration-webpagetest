const { json } = require('micro');
const mongo = require('./utils/mongo');

module.exports = mongo.withClose(async (req, res) => {
  const eventData = await json(req);
  const { payload } = eventData;
  const db = await mongo();
  await db.collection('deployments').updateOne(
    { id: payload.deploymentId },
    {
      $setOnInsert: {
        id: payload.deploymentId,
        url: payload.url,
        error: null,
        scores: null,
        ownerId: eventData.teamId || eventData.userId,
        auditing: 'scheduled',
        createdAt: eventData.createdAt,
      },
    },
    { upsert: true }
  );
  mongo.close().catch(console.error);
  res.statusCode = 200;
  res.end('ok');
});
