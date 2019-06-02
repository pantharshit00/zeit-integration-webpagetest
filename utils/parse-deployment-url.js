module.exports = function parseDeploymentURL(url) {
  const parts1 = url.split('.');
  const domain = parts1.slice(-2).join('.');
  const subdomain = parts1.slice(0, -2).join('.');

  const parts2 = subdomain.split('-');
  const projectName = parts2.slice(0, -1).join('-');
  const [id] = parts2.slice(-1);

  return {
    domain,
    subdomain,
    projectName,
    id,
  };
};
