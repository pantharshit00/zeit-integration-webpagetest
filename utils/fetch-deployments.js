const fetch = require('node-fetch');
const { stringify } = require('querystring');

module.exports = async ({
  accessToken,
  // from,
  limit,
  projectId,
  since,
  teamId,
}) => {
  const query = stringify({ limit, projectId, teamId });
  const res = await fetch(`https://api.zeit.co/v4/now/deployments?${query}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    const err = new Error('Failed to fetch deployments');
    err.res = res;
    err.body = await res.text();
    throw err;
  }

  let { deployments } = await res.json();

  if (since) {
    deployments = deployments.filter(d => d.created >= since);
  }

  return deployments;
};
