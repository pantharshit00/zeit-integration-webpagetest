const fetch = require('node-fetch');
const { HOST } = require('./env');

module.exports = async function({ token, teamId }) {
  const res = await fetch(
    `https://api.zeit.co/v1/integrations/webhooks${
      teamId ? `?teamId=${teamId}` : ''
    }`,
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      method: 'POST',
      body: JSON.stringify({
        name: 'WebPageTest Event Hook',
        url: `${HOST}/hook.js`,
        events: ['deployment-ready'],
      }),
    }
  );

  const body = await res.json();

  if (!res.ok) {
    const err = new Error(body.error_description || 'Failed to create webhook');
    err.res = res;
    err.body = body;
    throw err;
  }

  return body.id;
};
