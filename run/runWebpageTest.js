const { json } = require('micro');
const WebpageTest = require('webpagetest');
const fetchDeployment = require('../utils/fetch-single-deployment');
const mongo = require('../utils/mongo');
const auth = require('../utils/auth');

module.exports = mongo.withClose(
  auth(async (req, res) => {
    const batch = await json(req);
    const db = await mongo();
    if (batch.length) {
      await Promise.all(
        batch.map(async item => {
          // check for deployment state
          // fetch owner
          const owner = await db.collection('users').findOne(
            {
              id: item.ownerId,
            },
            {
              projection: {
                id: 1,
                apiKey: 1,
                accessToken: 1,
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

          const dData = await fetchDeployment({
            accessToken: owner.accessToken,
            id: item.id,
            teamId: owner.id.startsWith('team_') ? owner.id : null,
          });

          if (!dData.state === 'READY') {
            return;
          }

          // create the test
          const wbt = new WebpageTest('www.webpagetest.org', owner.apiKey);
          wbt.runTest(item.url, async (err, d) => {
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
            } else if (d.statusCode < 200) {
              return;
            } else {
              const {
                data: { testId },
              } = d;
              await data.collection('deployments').updateOne(
                { id: item.id },
                {
                  $set: {
                    auditing: 'running',
                    error: null,
                    testId,
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
