const fetch = require('node-fetch');

module.exports = async ({ accessToken, id }) => {
  const res = await fetch(`https://api.zeit.co/v4/now/deployments/${id}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const body = await res.json();

  if (!res.ok) {
    const err = new Error(body.error.message || 'Failed to fetch user');
    err.res = res;
    err.body = body;
    throw err;
  }

  return body;
};
