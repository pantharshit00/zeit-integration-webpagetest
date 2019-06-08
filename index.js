const { withUiHook, htm } = require('@zeit/integration-utils');
const ms = require('ms');
const { stringify } = require('querystring');
const mongo = require('./utils/mongo');
const parseDeploymentUrl = require('./utils/parse-deployment-url');

const Grade = ({ score, title }) => {
  let grade;
  let color;
  if (!score || score < 0) {
    color = '#aaa';
    grade = '?';
  } else if (score < 50) {
    color = '#c7221f';
    grade = 'F';
  } else if (score < 60) {
    color = '#c7221f';
    grade = 'E';
    color = '#c7221f';
  } else if (score < 70) {
    grade = 'D';
    color = '#c7221f';
  } else if (score < 80) {
    grade = 'C';
    color = '#f1c52e';
  } else if (score < 90) {
    grade = 'B';
    color = '#9bce54';
  } else {
    grade = 'A';
    color = '#9bce54';
  }

  return htm`
    <Box display="flex" flexDirection="column" alignItems="center">
      <Box 
        display="flex" height="60px" width="60px" justifyContent="center" alignItems="center" backgroundColor=${color}>
        <Box fontSize="36px">${grade}</Box>
      </Box>
      <P>${title}</P>
    </Box>
  `;
};

module.exports = withUiHook(
  mongo.withClose(async ({ payload, zeitClient }) => {
    const store = await zeitClient.getMetadata();
    const {
      action,
      clientState,
      configurationId,
      project,
      team,
      user,
      installationUrl,
      query,
    } = payload;
    const from = parseInt(clientState.from || query.from, 10) || undefined;
    const db = await mongo();
    const id = team ? team.id : user.id;
    if (action === 'submitKey') {
      store.apiKey = clientState.apiKey;
      // save it in mongo
      await db.collection('users').updateOne(
        { id },
        {
          $set: {
            apiKey: clientState.apiKey,
          },
        }
      );
      await zeitClient.setMetadata(store);
    }

    if (store.apiKey) {
      let deployments;
      let next;
      if (project) {
        ({ deployments } = await zeitClient.fetchAndThrow(
          `/v4/now/deployments?${stringify({
            limit: 10,
            from,
            projectId: project.id,
          })}`,
          {}
        ));
        if (deployments.length > 10) {
          deployments = deployments.slice(0, 10);
          next = deployments[deployments.length - 1].created - 1;
        }
      } else {
        // get projects maybe now
        let projects = await zeitClient.fetchAndThrow(
          `/v1/projects/list?${stringify({
            limit: 5 + 1,
            from,
          })}`,
          {}
        );
        if (projects.length > 5) {
          projects = projects.slice(0, 5);
          next = projects[projects.length - 1].createdAt - 1;
        }

        const projectDeployments = await Promise.all(
          projects.map(p =>
            zeitClient.fetchAndThrow(
              `/v4/now/deployments?limit=1&projectId=${encodeURIComponent(
                p.id
              )}`,
              {}
            )
          )
        );
        deployments = projectDeployments
          .map((p, i) => ({ ...p.deployments[0], project: projects[i] }))
          .filter(d => Boolean(d.uid));
      }

      const deploymentIds = deployments
        .filter(d => d.state === 'READY')
        .map(d => d.uid);

      console.log(`getting deployment docs`);
      const deploymentDocs = await db
        .collection('deployments')
        .find(
          {
            id: { $in: deploymentIds },
          },
          {
            projection: {
              id: 1,
              scores: 1,
              error: 1,
              auditing: 1,
              webPageTestUrl: 1,
              url: 1,
            },
          }
        )
        .toArray();
      mongo.close().catch(console.error);
      const deploymentDocMap = new Map(deploymentDocs.map(d => [d.id, d]));
      const nextUrl = next ? `${installationUrl}?from=${next}` : null;
      const ownerSlug = team ? team.slug : user.username;
      let needsAuthRefresh = false;

      const deploymentViews = deployments.map(d => {
        const doc = deploymentDocMap.get(d.uid);
        const parsedUrl = parseDeploymentUrl(d.url);
        const href = `https://${d.url}`;
        const deploymentHref = `https://zeit.co/${encodeURIComponent(
          ownerSlug
        )}/${encodeURIComponent(parsedUrl.projectName)}/${encodeURIComponent(
          parsedUrl.id
        )}`;
        const projectHref = d.project
          ? `https://zeit.co/${encodeURIComponent(
              ownerSlug
            )}/${encodeURIComponent(
              d.project.name
            )}/integrations/${encodeURIComponent(configurationId)}`
          : null;
        const relativeTime = Date.now() - d.created;
        const ago = relativeTime > 0 ? `${ms(relativeTime)} ago` : 'Just now';
        let contentView;

        if (d.state !== 'READY') {
          contentView = htm`<P>The deployment is not ready (<Box color="#bd10e0" display="inline">${
            d.state
          }</Box>)</P>`;
          if (d.state !== 'ERROR') {
            needsAuthRefresh = true;
          }
        } else if (
          doc &&
          (doc.auditing === 'scheduled' || doc.auditing === 'running')
        ) {
          contentView = htm`<P>Auditing...</P>`;
          needsAuthRefresh = true;
        } else if (doc && doc.scores) {
          const { scores } = doc;

          contentView = htm`
           <Box display="flex" justifyContent="space-between">
              <${Grade} score=${scores.cdn} title="CDN" />
              <${Grade} score=${scores.keepAlive} title="Keep-alive Enabled" />
              <${Grade} 
              score=${scores.compressTransfer} 
              title="Compress Transfer" />
              <${Grade} score=${scores.compression} title="Compress Images" />
              <${Grade} score=${scores.cache} title="Cache static content" />
            </Box>
            <BR />
            <FsFooter>
              <P>Full Report: <Link target="_blank" href=${
                doc.webPageTestUrl
              }>${doc.webPageTestUrl}</Link></P>
            </FsFooter>
        `;
        } else {
          contentView = htm`<P>No report available</P>`;
        }

        return htm`<Fieldset>
        <FsContent>
          ${
            d.project
              ? htm`<H2><Link href=${projectHref}><Box color="#000">${
                  d.project.name
                }</Box></Link></H2>`
              : ''
          }
        <Box display="flex" justifyContent="space-between" marginBottom="10px">
          <Box display="flex" alignItems="center">
            <Link href=${deploymentHref}><Box color="#000">${d.url}</Box></Link>
            <Box marginLeft="10px" marginRight=="5px" marginBottom="-5px">
              <Link href=${href} target="_blank"><Img src="https://lighthouse.zeit.sh/assets/link.png" height="13" width="13" /></>
            </Box>
          </Box>
          <Box>${ago}</Box>
        </Box>
          <BR />
          ${contentView}
          </FsContent>
        </Fieldset>
      `;
      });

      return htm`
      <Page>
        ${deploymentViews}
        ${nextUrl ? htm`<Link href=${nextUrl}>View Next →</Link>` : ''}
        ${needsAuthRefresh ? htm`<AutoRefresh timeout="5000" />` : ''}
      </Page>
    `;
    }

    return htm`
    <Page>
      <Fieldset>
        <FsContent>
          <H2>WebpageTest API Key</H2>
          <P>This is the API Key that will let us create a webpagetest</P>
          <Input name="apiKey" value="${store.apiKey || ''}" />
        </FsContent>
        <FsFooter>
          <P>You can grab your API key from <Link target="_blank" href="https://www.webpagetest.org/getkey.php">here</Link>. Please not that the API key is in form of <Box display="inline-block" color="#bd10e0" fontFamily="monospace">${'`A.XXXXXXXXX`'}</Box>. Please don't forget the <Box display="inline-block" fontFamily="monospace" color="#bd10e0">${'`A.`'}</Box> part</P>
        </FsFooter>
      </Fieldset>
      <Button action="submitKey">Submit</Button>
    </Page>
  `;
  })
);
