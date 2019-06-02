const { json } = require('micro');
const WebpageTest = require('webpagetest');
const mongo = require('../utils/mongo');
const auth = require('../utils/auth');

module.exports = mongo.withClose(
  auth(async (req, res) => {
    const batch = await json(req);
    const db = await mongo();
    if (batch.length) {
      await Promise.all(
        batch.map(async item => {
          // fetch owner
          const owner = await db.collection('users').findOne(
            {
              id: item.ownerId,
            },
            {
              projection: {
                id: 1,
                apiKey: 1,
              },
            }
          );
          if (!owner) {
            return;
          }
          if (!owner.apiKey) {
            await db.collection('deployments').updateOne(
              { id: item.id },
              {
                $set: {
                  error:
                    'API Key was not available. Please wait till we rerun the test.',
                },
              }
            );
            return;
          }
          // create the test
          const wbt = new WebpageTest('www.webpagetest.org', owner.apiKey);
          wbt.getTestResults(item.testId, async (err, d) => {
            const data = await mongo();
            if (err) {
              return;
            }

            if (d.statusCode >= 400) {
              await data.collection('deployments').updateOne(
                { id: item.id },
                {
                  $set: {
                    error: d.statusText,
                  },
                }
              );
            } else {
              const {
                data: {
                  summary,
                  average: { firstView },
                },
              } = d;
              await data.collection('deployments').updateOne(
                { id: item.id },
                {
                  $set: {
                    auditing: 'done',
                    webPageTestUrl: summary,
                    scores: {
                      compression: firstView.score_compress,
                      keepAlive: firstView['score_keep-alive'],
                      cache: firstView.score_cache,
                      cdn: firstView.score_cdn,
                      firstByte: firstView.TTFB,
                      compressTransfer: firstView.score_gzip,
                    },
                  },
                }
              );
            }
            mongo.close().catch(console.error);
          });
        })
      );
    }
    res.end('ok');
  })
);
