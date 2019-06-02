const fetch = require('node-fetch');
const { API_SECRET, HOST } = require('./env');

module.exports = (path, params) =>
  fetch(`${HOST}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${API_SECRET}`,
    },
    body: params ? JSON.stringify(params) : null,
  });
