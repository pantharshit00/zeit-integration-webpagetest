const { parse } = require('url');
const { Sema } = require('async-sema');
const groupby = require('lodash.groupby');
const maxby = require('lodash.maxby');
const { HOST } = require('./utils/env');
const fetchAccessToken = require('./utils/fetch-access-token');
const createWebHook = require('./utils/create-web-hook');
const fetchDeployments = require('./utils/fetch-deployments');
const fetchUser = require('./utils/fetch-user');
const mongo = require('./utils/mongo');

const AUDIT_DEPLOYMENTS_CREATED_AFTER = 30 * 24 * 60 * 60 * 1000;

module.exports = mongo.withClose(async function(req, res) {
  const {
    query: { code, next, teamId },
  } = parse(req.url, true);

  if (!code) {
    res.statusCode = 400;
    res.end('missing query parameter: code');
    return;
  }

  // exchange the code for a token
  const accessToken = await fetchAccessToken({
    code,
    redirectUri: `${HOST}/callback.js`,
  });

  // let's create a webhook
  const webHookId = await createWebHook({ token: accessToken, teamId });

  // create a new user with the info
  let [user, deployments] = await Promise.all([
    teamId ? null : fetchUser({ accessToken }),
    fetchDeployments({
      accessToken,
      limit: 50,
      since: Date.now() - AUDIT_DEPLOYMENTS_CREATED_AFTER,
      teamId,
    }),
  ]);

  deployments = groupby(deployments.filter(d => d.state === 'READY'), 'name');

  const latestDeploymentsPerProject = [];
  Object.values(deployments).forEach(deployment => {
    latestDeploymentsPerProject.push(maxby(deployment, 'created'));
  });

  const db = await mongo();
  await db.collection('users').updateOne(
    { id: teamId || user.uid },
    {
      $set: {
        id: teamId || user.uid,
        accessToken,
        apiKey: null,
        webHookId,
      },
      $setOnInsert: {
        createdAt: Date.now(),
      },
    },
    { upsert: true }
  );
  const deploymentsCollection = db.collection('deployments');
  const sema = new Sema(10);
  await Promise.all(
    latestDeploymentsPerProject.map(async d => {
      await sema.acquire();

      try {
        const now = Date.now();
        return await deploymentsCollection.updateOne(
          { id: d.uid },
          {
            $setOnInsert: {
              id: d.uid,
              url: d.url,
              error: null,
              scores: null,
              ownerId: teamId || user.uid,
              auditing: 'scheduled',
              createdAt: now,
            },
          },
          { upsert: true }
        );
      } finally {
        sema.release();
      }
    })
  );
  mongo.close().catch(console.error);
  res.statusCode = 302;
  res.setHeader('Location', next);
  res.end();
});
